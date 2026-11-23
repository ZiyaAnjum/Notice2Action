"""API router for notice uploads, retrieval, page text, checklist items, and reminders."""

from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi import (
    Path as FastPath,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.dependencies import get_current_user, get_llm
from backend.app.models.user import UserModel
from backend.app.schemas import (
    ChecklistItemResponse,
    ChecklistUpdateRequest,
    NoticeDetailResponse,
    NoticeListItem,
    NoticeUploadResponse,
    PageTextResponse,
    ReminderCreateRequest,
    ReminderResponse,
)
from backend.app.security import rate_limiter
from backend.app.services.notice_service import NoticeServiceError, notice_service
from extraction.llm_client import BaseLLMClient

router = APIRouter()


@router.get(
    "/sample", summary="Retrieve mock sample notice matching schema v1.0", include_in_schema=False
)
async def get_sample_notice() -> dict:
    """Return the canonical sample notice for backward-compatible frontend/test integration."""
    return {
        "notice_id": "notice-stub-001",
        "schema_version": "1.0",
        "category": "scholarship_or_college",
        "category_confidence": 0.95,
        "title": {
            "value": "Sample Placeholder Notice",
            "evidence": {"page": 1, "quote": "Placeholder Notice Heading"},
            "status": "found",
        },
        "issuer": {
            "value": "Department of Education",
            "evidence": {"page": 1, "quote": "Department of Education"},
            "status": "found",
        },
        "deadlines": [],
        "required_documents": [],
        "action_steps": [],
        "document_quality": "good",
    }


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=NoticeUploadResponse,
    summary="Upload PDF or photo notice for extraction",
    description="Accepts a PDF document or one or more camera photos, validates quality and magic bytes, and queues pipeline processing.",
)
async def upload_notice(
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
    llm_client: Annotated[BaseLLMClient, Depends(get_llm)],
    file: Annotated[UploadFile | None, File(description="Official notice PDF or single photo")] = None,
    files: Annotated[list[UploadFile] | None, File(description="List of notice photos")] = None,
) -> NoticeUploadResponse:
    """Upload and queue notice processing scoped to authenticated user."""
    # Rate limit demo account uploads
    if current_user.is_demo:
        demo_rate_key = f"demo:upload:{current_user.id}"
        if not rate_limiter.is_allowed(demo_rate_key, max_attempts=5, window_seconds=3600):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "DEMO_UPLOAD_LIMIT",
                    "error_code": "DEMO_UPLOAD_LIMIT",
                    "message": "Demo account upload limit reached (max 5 uploads/hour). Please sign up for your own account for full access.",
                },
            )

    try:
        if files and len(files) > 0:
            photo_payloads = []
            for f in files:
                b = await f.read()
                photo_payloads.append((f.filename or "photo.jpg", b, f.content_type))
            if len(photo_payloads) == 1:
                notice_id, stored_path = notice_service.validate_and_save_upload(
                    filename=photo_payloads[0][0],
                    contents=photo_payloads[0][1],
                    content_type=photo_payloads[0][2],
                    user_id=current_user.id,
                )
            else:
                notice_id, stored_path = notice_service.validate_and_save_photo_upload(
                    photos=photo_payloads,
                    user_id=current_user.id,
                )
            upload_filename = files[0].filename or "camera_notice.jpg"
        elif file is not None:
            contents = await file.read()
            notice_id, stored_path = notice_service.validate_and_save_upload(
                filename=file.filename or "uploaded_notice.pdf",
                contents=contents,
                content_type=file.content_type,
                user_id=current_user.id,
            )
            upload_filename = file.filename or "uploaded_notice.pdf"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "NO_FILE", "message": "No file or photos provided for upload."},
            )
    except NoticeServiceError as err:
        raise HTTPException(
            status_code=err.status_code,
            detail={"error": err.error_code, "message": err.message},
        ) from None

    # Create pending record in DB (or retrieve from cache if duplicate belonging to this user)
    notice_record, is_cached = notice_service.create_pending_notice(
        db=db,
        notice_id=notice_id,
        filename=upload_filename,
        stored_path=stored_path,
        user_id=current_user.id,
    )

    if not is_cached:
        # Queue background processing pipeline
        background_tasks.add_task(
            notice_service.run_background_pipeline,
            notice_id=notice_id,
            stored_path=str(stored_path.resolve()),
            llm_client=llm_client,
        )

    return NoticeUploadResponse(
        id=notice_record.id,
        notice_id=notice_record.id,
        status=notice_record.status,
        stage=notice_record.stage or ("done" if is_cached else "uploading"),
        progress=notice_record.progress if notice_record.progress is not None else (100 if is_cached else 10),
        message=notice_record.message or ("Notice retrieved instantly from cache." if is_cached else "Notice uploaded and queued for processing."),
    )


# Backward-compatible alias for existing tests
@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def legacy_upload_notice(
    file: Annotated[UploadFile, File(description="Official notice in PDF format")],
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
    llm_client: Annotated[BaseLLMClient, Depends(get_llm)],
) -> dict:
    res = await upload_notice(file, background_tasks, db, current_user, llm_client)
    return {"notice_id": res.id, "status": res.status, "message": res.message}


@router.get(
    "",
    response_model=list[NoticeListItem],
    summary="List all uploaded notices",
    description="Returns a list of all processed or pending notices for the authenticated user, sorted newest first.",
)
async def list_notices(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> list[NoticeListItem]:
    """List all notices scoped to the authenticated user."""
    items = notice_service.list_notices(db, user_id=current_user.id)
    return [NoticeListItem(**item) for item in items]


@router.get(
    "/{notice_id}",
    response_model=NoticeDetailResponse,
    summary="Get full notice details",
    description="Returns the full extracted JSON contract along with checklist items and reminders. Returns 404 for unowned notices.",
)
async def get_notice(
    notice_id: Annotated[str, FastPath(description="Unique notice ID")],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> NoticeDetailResponse:
    """Retrieve complete notice record scoped to authenticated user."""
    detail = notice_service.get_notice_detail(db, notice_id, user_id=current_user.id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOTICE_NOT_FOUND", "message": f"Notice '{notice_id}' was not found."},
        )
    return NoticeDetailResponse(**detail)


@router.get(
    "/{notice_id}/pages/{page}",
    response_model=PageTextResponse,
    summary="Get extracted page text",
    description="Returns the raw normalized text of a specific page for passage viewing. Returns 404 for unowned notices.",
)
async def get_notice_page(
    notice_id: Annotated[str, FastPath(description="Unique notice ID")],
    page: Annotated[int, FastPath(ge=1, description="1-indexed page number")],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> PageTextResponse:
    """Return text of a specific notice page scoped to user."""
    detail = notice_service.get_notice_detail(db, notice_id, user_id=current_user.id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOTICE_NOT_FOUND", "message": f"Notice '{notice_id}' was not found."},
        )

    page_data = notice_service.get_notice_page_text(db, notice_id, page, user_id=current_user.id)
    if not page_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "PAGE_NOT_FOUND",
                "message": f"Page {page} not found for notice '{notice_id}'.",
            },
        )
    return PageTextResponse(**page_data)


@router.get(
    "/{notice_id}/pages/{page}/image",
    summary="Get original page image",
    description="Returns the original color photo or rendered page image for source evidence verification.",
)
async def get_notice_page_image(
    notice_id: Annotated[str, FastPath(description="Unique notice ID")],
    page: Annotated[int, FastPath(ge=1, description="1-indexed page number")],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> FileResponse:
    """Return original color photo or rendered page image scoped to authenticated owner."""
    image_info = notice_service.get_notice_page_image_path(db, notice_id, page, user_id=current_user.id)
    if not image_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "PAGE_IMAGE_NOT_FOUND",
                "message": f"Image for page {page} not found for notice '{notice_id}'.",
            },
        )
    img_path, media_type = image_info
    return FileResponse(
        path=img_path,
        media_type=media_type,
        filename=img_path.name,
    )


@router.get(
    "/{notice_id}/file",
    summary="Download original notice PDF or color document",
    description="Controlled access endpoint serving the original uploaded PDF file or color compilation for the authenticated owner.",
)
async def get_notice_file(
    notice_id: Annotated[str, FastPath(description="Unique notice ID")],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> FileResponse:
    """Stream the original notice PDF or photo file scoped to authenticated owner."""
    file_info = notice_service.get_notice_file_path(db, notice_id, user_id=current_user.id)
    if not file_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "FILE_NOT_FOUND",
                "message": f"File for notice '{notice_id}' not found.",
            },
        )

    file_path, original_filename = file_info
    media_type = "image/jpeg" if original_filename.lower().endswith((".jpg", ".jpeg")) else "application/pdf"
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=original_filename,
    )


@router.patch(
    "/{notice_id}/checklist/{item_key:path}",
    response_model=ChecklistItemResponse,
    summary="Update checklist item status",
    description="Sets the status of a checklist item (not_completed, completed, or needs_verification).",
)
async def update_checklist(
    notice_id: str,
    item_key: str,
    payload: ChecklistUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> ChecklistItemResponse:
    """Update or create a checklist status item scoped to authenticated owner."""
    detail = notice_service.get_notice_detail(db, notice_id, user_id=current_user.id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOTICE_NOT_FOUND", "message": f"Notice '{notice_id}' was not found."},
        )

    valid_statuses = ("not_completed", "completed", "needs_verification")
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "INVALID_STATUS",
                "message": f"Status must be one of {valid_statuses}. Received: '{payload.status}'.",
            },
        )

    updated = notice_service.update_checklist_item(
        db, notice_id, item_key, payload.status, user_id=current_user.id
    )
    return ChecklistItemResponse(**updated)


@router.post(
    "/{notice_id}/reminders",
    status_code=status.HTTP_201_CREATED,
    response_model=ReminderResponse,
    summary="Create deadline reminder",
    description="Creates an in-app reminder scheduled for a specific date.",
)
async def create_notice_reminder(
    notice_id: str,
    payload: ReminderCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> ReminderResponse:
    """Create a new deadline reminder for a notice scoped to authenticated owner."""
    detail = notice_service.get_notice_detail(db, notice_id, user_id=current_user.id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOTICE_NOT_FOUND", "message": f"Notice '{notice_id}' was not found."},
        )

    reminder = notice_service.create_reminder(
        db=db,
        notice_id=notice_id,
        deadline_ref=payload.deadline_ref,
        remind_on=payload.remind_on,
        note=payload.note,
        user_id=current_user.id,
    )
    return ReminderResponse(**reminder)


@router.get(
    "/{notice_id}/reminders",
    response_model=list[ReminderResponse],
    summary="List notice reminders",
    description="Returns all reminders configured for this notice.",
)
async def list_notice_reminders(
    notice_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> list[ReminderResponse]:
    """Retrieve all reminders for a notice scoped to authenticated owner."""
    detail = notice_service.get_notice_detail(db, notice_id, user_id=current_user.id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOTICE_NOT_FOUND", "message": f"Notice '{notice_id}' was not found."},
        )

    reminders = notice_service.list_reminders_for_notice(db, notice_id, user_id=current_user.id) or []
    return [ReminderResponse(**r) for r in reminders]


@router.delete(
    "/{notice_id}",
    summary="Delete notice and stored files",
    description="Permanently deletes the notice record, stored PDF, checklist, and reminders.",
)
async def delete_notice(
    notice_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> dict:
    """Permanently delete notice and associated data scoped to authenticated owner."""
    success = notice_service.delete_notice(db, notice_id, user_id=current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOTICE_NOT_FOUND", "message": f"Notice '{notice_id}' was not found."},
        )
    return {
        "status": "deleted",
        "id": notice_id,
        "message": "Notice and associated files deleted permanently.",
    }
