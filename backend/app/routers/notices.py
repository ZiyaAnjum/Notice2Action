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
from backend.app.dependencies import get_llm
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
    summary="Upload PDF notice for extraction",
    description="Accepts a multipart/form-data PDF file, validates format and magic bytes, and queues pipeline processing.",
)
async def upload_notice(
    file: Annotated[UploadFile, File(description="Official notice PDF file")],
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    llm_client: Annotated[BaseLLMClient, Depends(get_llm)],
) -> NoticeUploadResponse:
    """Upload and queue notice processing."""
    try:
        contents = await file.read()
        notice_id, stored_path = notice_service.validate_and_save_upload(
            filename=file.filename or "uploaded_notice.pdf",
            contents=contents,
            content_type=file.content_type,
        )
    except NoticeServiceError as err:
        raise HTTPException(
            status_code=err.status_code,
            detail={"error": err.error_code, "message": err.message},
        ) from None

    # Create pending record in DB
    notice_service.create_pending_notice(
        db=db,
        notice_id=notice_id,
        filename=file.filename or "uploaded_notice.pdf",
        stored_path=stored_path,
    )

    # Queue background processing pipeline
    background_tasks.add_task(
        notice_service.run_background_pipeline,
        notice_id=notice_id,
        stored_path=str(stored_path.resolve()),
        llm_client=llm_client,
    )

    return NoticeUploadResponse(
        id=notice_id,
        status="processing",
        message="Notice uploaded and queued for processing.",
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
    llm_client: Annotated[BaseLLMClient, Depends(get_llm)],
) -> dict:
    res = await upload_notice(file, background_tasks, db, llm_client)
    return {"notice_id": res.id, "status": res.status, "message": res.message}


@router.get(
    "",
    response_model=list[NoticeListItem],
    summary="List all uploaded notices",
    description="Returns a list of all processed or pending notices, sorted newest first.",
)
async def list_notices(db: Annotated[Session, Depends(get_db)]) -> list[NoticeListItem]:
    """List all notices with status and deadline summary."""
    items = notice_service.list_notices(db)
    return [NoticeListItem(**item) for item in items]


@router.get(
    "/{notice_id}",
    response_model=NoticeDetailResponse,
    summary="Get full notice details",
    description="Returns the full extracted JSON contract along with checklist items and reminders.",
)
async def get_notice(
    notice_id: Annotated[str, FastPath(description="Unique notice ID")],
    db: Annotated[Session, Depends(get_db)],
) -> NoticeDetailResponse:
    """Retrieve complete notice record by ID."""
    detail = notice_service.get_notice_detail(db, notice_id)
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
    description="Returns the raw normalized text of a specific page for passage viewing (FR-10).",
)
async def get_notice_page(
    notice_id: Annotated[str, FastPath(description="Unique notice ID")],
    page: Annotated[int, FastPath(ge=1, description="1-indexed page number")],
    db: Annotated[Session, Depends(get_db)],
) -> PageTextResponse:
    """Return text of a specific notice page."""
    detail = notice_service.get_notice_detail(db, notice_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOTICE_NOT_FOUND", "message": f"Notice '{notice_id}' was not found."},
        )

    page_data = notice_service.get_notice_page_text(db, notice_id, page)
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
    "/{notice_id}/file",
    summary="Download original notice PDF",
    description="Controlled access endpoint serving the original uploaded PDF file.",
)
async def get_notice_file(
    notice_id: Annotated[str, FastPath(description="Unique notice ID")],
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    """Stream the original notice PDF file."""
    file_info = notice_service.get_notice_file_path(db, notice_id)
    if not file_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "FILE_NOT_FOUND",
                "message": f"File for notice '{notice_id}' not found.",
            },
        )

    file_path, original_filename = file_info
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
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
) -> ChecklistItemResponse:
    """Update or create a checklist status item."""
    detail = notice_service.get_notice_detail(db, notice_id)
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

    updated = notice_service.update_checklist_item(db, notice_id, item_key, payload.status)
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
) -> ReminderResponse:
    """Create a new deadline reminder for a notice."""
    detail = notice_service.get_notice_detail(db, notice_id)
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
) -> list[ReminderResponse]:
    """Retrieve all reminders for a notice."""
    detail = notice_service.get_notice_detail(db, notice_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "NOTICE_NOT_FOUND", "message": f"Notice '{notice_id}' was not found."},
        )

    reminders = notice_service.list_reminders_for_notice(db, notice_id) or []
    return [ReminderResponse(**r) for r in reminders]


@router.delete(
    "/{notice_id}",
    summary="Delete notice and stored files",
    description="Permanently deletes the notice record, stored PDF, checklist, and reminders (Delete My Data).",
)
async def delete_notice(
    notice_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Permanently delete notice and associated data."""
    success = notice_service.delete_notice(db, notice_id)
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
