from typing import Annotated, Any

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from backend.app.config import get_settings
from backend.app.services.notice_service import NoticeService

router = APIRouter()
settings = get_settings()
notice_service = NoticeService()


@router.get("/sample", summary="Retrieve mock sample notice matching schema v1.0")
async def get_sample_notice() -> dict[str, Any]:
    """Return the canonical sample notice for frontend development and testing."""
    return notice_service.get_sample_notice()


@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    summary="Upload PDF notice for extraction",
)
async def upload_notice(
    file: Annotated[UploadFile, File(description="Official notice in PDF format")],
) -> dict[str, Any]:
    """Upload a PDF file. Validates MIME type and size limit before delegating to extraction stub."""
    # 1. Verify content type
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "INVALID_FILE_TYPE",
                "message": f"Only PDF documents are supported. Received content-type: '{file.content_type}'.",
            },
        )

    # 2. Check file size
    contents = await file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "error_code": "FILE_TOO_LARGE",
                "message": f"File size exceeds maximum permitted limit of {settings.MAX_UPLOAD_MB} MB.",
            },
        )

    # Reset cursor and delegate to service stub
    await file.seek(0)
    result = await notice_service.process_uploaded_file(file.filename or "notice.pdf", contents)
    return result


@router.get("/{notice_id}", summary="Get extracted notice by ID")
async def get_notice(notice_id: str) -> dict[str, Any]:
    """Retrieve an extracted notice by ID."""
    notice = notice_service.get_notice_by_id(notice_id)
    if not notice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error_code": "NOTICE_NOT_FOUND",
                "message": f"Notice with ID '{notice_id}' was not found.",
            },
        )
    return notice
