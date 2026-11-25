"""Service layer for notice management, file storage, and pipeline execution."""

import hashlib
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from backend.app.config import get_settings
from backend.app.database import SessionLocal
from backend.app.models.notice import ChecklistItemModel, NoticeModel, ReminderModel
from backend.app.services.image_preprocessor import (
    ImageProcessingError,
    MAX_PHOTOS_PER_NOTICE,
    create_pdf_from_images,
    detect_image_format,
    enhance_image_for_ocr,
    normalize_and_strip_metadata,
    save_image_as_jpeg_bytes,
)
from backend.app.services.summary_service import generate_multilingual_summary
from backend.app.storage import FileStorage, get_storage
from extraction.extractor import MAX_FILE_SIZE_BYTES, extract_pages
from extraction.llm_client import BaseLLMClient
from extraction.pipeline import process_notice

settings = get_settings()


class NoticeServiceError(Exception):
    """Custom exception for notice service errors with HTTP status code."""

    def __init__(self, error_code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code


class NoticeService:
    """Coordinates file validation, storage, background extraction, and data operations."""

    def __init__(
        self,
        upload_dir: str | Path | None = None,
        session_factory: Any = None,
        storage: FileStorage | None = None,
    ) -> None:
        self.storage: FileStorage = storage or get_storage(upload_dir=upload_dir)
        self._upload_dir = Path(upload_dir or settings.UPLOAD_DIR)
        self.session_factory = session_factory or SessionLocal

    @property
    def upload_dir(self) -> Path:
        """Return the active upload directory for backward compatibility."""
        if hasattr(self.storage, "upload_dir"):
            return self.storage.upload_dir
        return self._upload_dir

    @upload_dir.setter
    def upload_dir(self, val: str | Path) -> None:
        """Set the upload directory on both service and underlying storage."""
        p = Path(val)
        self._upload_dir = p
        if hasattr(self.storage, "upload_dir"):
            self.storage.upload_dir = p

    def validate_and_save_upload(
        self,
        filename: str,
        contents: bytes,
        content_type: str | None,
        user_id: str | None = None,
    ) -> tuple[str, Path]:
        """Validate uploaded PDF or single photo bytes and persist to scoped storage.

        Args:
            filename: Original user filename (for display only).
            contents: Raw file byte stream.
            content_type: Header content-type string.
            user_id: Optional user identifier for scoped directory storage.

        Returns:
            Tuple of (unique notice_id, safe saved local Path).

        Raises:
            NoticeServiceError: On format, magic byte, size, or emptiness violations.
        """
        # If image format detected, delegate to photo upload handler
        is_image = (
            (content_type and content_type.lower() in ("image/jpeg", "image/jpg", "image/png", "image/webp"))
            or filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
            or detect_image_format(contents) is not None
        )
        if is_image:
            return self.validate_and_save_photo_upload([(filename, contents, content_type)], user_id=user_id)

        # 1. Content-type check for PDF
        if content_type != "application/pdf":
            raise NoticeServiceError(
                error_code="INVALID_FILE_TYPE",
                message=f"Only PDF documents and JPEG/PNG/WEBP photos are supported. Received content-type: '{content_type}'.",
                status_code=400,
            )

        # 2. Emptiness check
        if len(contents) == 0:
            raise NoticeServiceError(
                error_code="EMPTY_FILE",
                message="The uploaded PDF file is empty (0 bytes).",
                status_code=400,
            )

        # 3. Magic bytes check (PDF header must start with %PDF-)
        if not contents.startswith(b"%PDF"):
            raise NoticeServiceError(
                error_code="INVALID_MAGIC_BYTES",
                message="File content is not a valid PDF document (missing '%PDF' magic header).",
                status_code=422,
            )

        # 4. Size limit check (reuse extractor limit or settings)
        max_bytes = min(MAX_FILE_SIZE_BYTES, settings.MAX_UPLOAD_MB * 1024 * 1024)
        if len(contents) > max_bytes:
            limit_mb = round(max_bytes / (1024 * 1024))
            raise NoticeServiceError(
                error_code="FILE_TOO_LARGE",
                message=f"File size exceeds maximum permitted limit of {limit_mb} MB.",
                status_code=413,
            )

        # 5. Save with random safe UUID filename in per-user path
        try:
            stored_path_str = self.storage.save(filename, contents, user_id=user_id)
        except TypeError:
            stored_path_str = self.storage.save(filename, contents)
        stored_path = Path(stored_path_str)

        notice_id = f"notice-{uuid.uuid4().hex[:12]}"
        return notice_id, stored_path

    def validate_and_save_photo_upload(
        self,
        photos: list[tuple[str, bytes, str | None]],
        user_id: str | None = None,
    ) -> tuple[str, Path]:
        """Validate and compile camera photos into clean multi-page document containers.

        Rules:
        - Maximum 10 photos per notice.
        - Total upload size <= 25 MB.
        - Strip EXIF/GPS metadata after correcting orientation.
        - Lightweight numpy Laplacian sharpness check: reject severely blurred photos with friendly error.
        - Keep original color photo (compressed) for source viewer.
        - Generate enhanced grayscale/contrast copy for OCR extraction container.
        """
        if not photos:
            raise NoticeServiceError(
                error_code="EMPTY_FILE",
                message="No photo files were uploaded.",
                status_code=400,
            )

        if len(photos) > MAX_PHOTOS_PER_NOTICE:
            raise NoticeServiceError(
                error_code="TOO_MANY_PHOTOS",
                message=f"Maximum {MAX_PHOTOS_PER_NOTICE} photos allowed per notice. Received {len(photos)} photos.",
                status_code=400,
            )

        total_bytes = sum(len(b) for _, b, _ in photos)
        max_bytes = 25 * 1024 * 1024  # 25 MB
        if total_bytes > max_bytes:
            limit_mb = round(max_bytes / (1024 * 1024))
            raise NoticeServiceError(
                error_code="FILE_TOO_LARGE",
                message=f"Total photo upload size ({round(total_bytes / (1024 * 1024), 1)} MB) exceeds {limit_mb} MB limit.",
                status_code=413,
            )

        notice_id = f"notice-{uuid.uuid4().hex[:12]}"
        clean_color_images = []
        enhanced_images = []

        for idx, (p_name, p_bytes, p_mime) in enumerate(photos):
            if len(p_bytes) == 0:
                raise NoticeServiceError(
                    error_code="EMPTY_FILE",
                    message=f"Photo {idx + 1} is completely empty (0 bytes).",
                    status_code=400,
                )

            try:
                clean_color, sharpness = normalize_and_strip_metadata(p_bytes)
            except ImageProcessingError as img_err:
                raise NoticeServiceError(
                    error_code=img_err.error_code,
                    message=f"Photo {idx + 1}: {img_err.message}",
                    status_code=img_err.status_code,
                ) from None

            # Sharpness / blurriness check (variance of Laplacian)
            if sharpness < 20.0:
                raise NoticeServiceError(
                    error_code="BLURRY_PHOTO",
                    message=f"Photo {idx + 1} is too blurry or out of focus. Please retake a clearer, well-lit photo of the notice.",
                    status_code=400,
                )

            enhanced = enhance_image_for_ocr(clean_color)
            clean_color_images.append(clean_color)
            enhanced_images.append(enhanced)

            # Persist original color photo as a clean JPEG for page-level source viewing
            page_num = idx + 1
            page_img_bytes = save_image_as_jpeg_bytes(clean_color)
            try:
                self.storage.save(f"{notice_id}_page_{page_num}_color.jpg", page_img_bytes, user_id=user_id, preserve_filename=True)
            except TypeError:
                self.storage.save(f"{notice_id}_page_{page_num}_color.jpg", page_img_bytes, user_id=user_id)

        # 1. Compile enhanced images into extraction PDF container
        enhanced_pdf_bytes = create_pdf_from_images(enhanced_images)
        try:
            stored_path_str = self.storage.save(f"{notice_id}.pdf", enhanced_pdf_bytes, user_id=user_id, preserve_filename=True)
        except TypeError:
            stored_path_str = self.storage.save(f"{notice_id}.pdf", enhanced_pdf_bytes, user_id=user_id)
        stored_path = Path(stored_path_str)

        # 2. Compile clean color images into original viewer PDF container
        color_pdf_bytes = create_pdf_from_images(clean_color_images)
        try:
            self.storage.save(f"{notice_id}_color.pdf", color_pdf_bytes, user_id=user_id, preserve_filename=True)
        except TypeError:
            self.storage.save(f"{notice_id}_color.pdf", color_pdf_bytes, user_id=user_id)

        return notice_id, stored_path

    def create_pending_notice(
        self,
        db: Session,
        notice_id: str,
        filename: str,
        stored_path: Path,
        file_hash: str | None = None,
        user_id: str | None = None,
    ) -> tuple[NoticeModel, bool]:
        """Create initial database notice record or return cached record for instant hit.

        Cache lookup is strictly scoped per user so one user never sees another's cached data.
        """
        p = Path(stored_path)
        if not file_hash and p.exists():
            try:
                file_hash = hashlib.sha256(p.read_bytes()).hexdigest()
            except Exception:
                file_hash = None

        # Check for cached result by SHA-256 (scoped per user)
        if file_hash:
            query = db.query(NoticeModel).filter(
                NoticeModel.file_hash == file_hash,
                NoticeModel.status.in_(["complete", "processed", "partial"]),
                NoticeModel.result_json.isnot(None),
            )
            if user_id:
                query = query.filter(NoticeModel.user_id == user_id)
            cached = query.first()

            if cached and cached.result_json:
                notice = NoticeModel(
                    id=notice_id,
                    user_id=user_id,
                    original_filename=filename,
                    stored_path=str(p.resolve()),
                    file_hash=file_hash,
                    status=cached.status,
                    stage="done",
                    progress=100,
                    category=cached.category,
                    result_json=cached.result_json,
                    needs_verification=cached.needs_verification,
                    message="Notice retrieved instantly from cache.",
                    created_at=datetime.now(timezone.utc),
                )
                db.add(notice)
                db.commit()
                db.refresh(notice)
                return notice, True

        notice = NoticeModel(
            id=notice_id,
            user_id=user_id,
            original_filename=filename,
            stored_path=str(p.resolve()),
            file_hash=file_hash,
            status="processing",
            stage="uploading",
            progress=10,
            created_at=datetime.now(timezone.utc),
            needs_verification=False,
            message="Notice uploaded and queued for processing.",
        )
        db.add(notice)
        db.commit()
        db.refresh(notice)
        return notice, False

    def run_background_pipeline(
        self,
        notice_id: str,
        stored_path: str,
        llm_client: BaseLLMClient | None = None,
    ) -> None:
        """Execute processing pipeline in background with stage tracking and budget enforcement."""
        session_maker = self.session_factory or SessionLocal
        db: Session = session_maker()
        try:
            notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
            if not notice:
                return

            if notice.stage == "done" and notice.status in ("complete", "processed", "partial"):
                return

            # Stage: reading_text
            notice.stage = "reading_text"
            notice.progress = 30
            db.commit()

            # Execute pipeline (enable Gemini Vision fallback for photo-based notices)
            is_photo_notice = (
                notice.original_filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
                or (Path(notice.stored_path).parent / f"{notice.id}_color.pdf").exists()
            )
            pipeline_res = process_notice(
                stored_path, client=llm_client, allow_vision_fallback=is_photo_notice
            )

            notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
            if not notice:
                return

            pipe_status = pipeline_res.get("status")

            if pipe_status in ("success", "complete", "partial"):
                decision_card = pipeline_res.get("result") or {}
                doc_status = decision_card.get("status") or ("partial" if pipeline_res.get("needs_verification") else "complete")
                notice.status = doc_status
                notice.stage = "done"
                notice.progress = 100
                notice.category = pipeline_res.get("category")
                notice.result_json = decision_card
                notice.needs_verification = pipeline_res.get("needs_verification", False)
                notice.message = pipeline_res.get("message", "Processed successfully.")

                # Populate checklist
                docs = decision_card.get("required_documents") or []
                for idx, doc in enumerate(docs):
                    doc_name = doc.get("name") or f"Document {idx + 1}"
                    checklist_item = ChecklistItemModel(
                        notice_id=notice.id,
                        item_key=doc_name,
                        status="not_completed",
                    )
                    db.add(checklist_item)

            elif pipe_status == "needs_clearer_document":
                is_photo = (
                    notice.original_filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
                    or (Path(notice.stored_path).parent / f"{notice.id}_color.pdf").exists()
                )
                msg = (
                    "We couldn't clearly read text from this photo. Please retake a sharper, well-lit photo of the notice."
                    if is_photo
                    else "We couldn't read text from this PDF. Try a clearer scan."
                )
                notice.status = "failed"
                notice.stage = "done"
                notice.progress = 100
                notice.error = msg
                notice.error_code = "UNREADABLE_DOCUMENT"
                notice.message = msg

            elif pipe_status == "out_of_scope":
                notice.status = "failed"
                notice.stage = "done"
                notice.progress = 100
                notice.error = pipeline_res.get("message", "This document is out of scope.")
                notice.error_code = "DOCUMENT_OUT_OF_SCOPE"
                notice.message = pipeline_res.get("message")

            elif (
                pipeline_res.get("failure_reason") == "too_slow"
                or pipeline_res.get("error_code") == "DOCUMENT_PROCESSING_TIMEOUT"
            ):
                # Hard budget timeout: return status partial with whatever stages have finished
                # If no usable text or no valid summary at all, return status "failed" with friendly message
                has_usable_result = (
                    pipeline_res.get("result") is not None
                    and isinstance(pipeline_res.get("result"), dict)
                    and bool(pipeline_res.get("result").get("headline"))
                )
                if has_usable_result:
                    notice.status = "partial"
                    notice.stage = "done"
                    notice.progress = 100
                    notice.error = "Processing reached 60-second limit; partial results returned."
                    notice.error_code = "PROCESSING_TIMEOUT"
                    notice.message = "Processing reached 60-second limit; partial results returned."
                    notice.result_json = pipeline_res.get("result")
                else:
                    notice.status = "failed"
                    notice.stage = "done"
                    notice.progress = 100
                    notice.error = "We couldn't read text from this PDF. Try a clearer scan."
                    notice.error_code = "UNREADABLE_DOCUMENT"
                    notice.message = "We couldn't read text from this PDF. Try a clearer scan."

            else:
                notice.status = "failed"
                notice.stage = "done"
                notice.progress = 100
                msg = str(pipeline_res.get("message", "Extraction failed."))
                if "daily limit" in msg.lower() or "quota" in msg.lower() or "resource_exhausted" in msg.lower() or "429" in msg:
                    logger.error("Raw API quota error for notice %s logged to backend: %s", notice_id, msg)
                    msg = "The AI service is busy or its daily limit was reached. Please try again later."
                    notice.error_code = "QUOTA_EXHAUSTED"
                elif any(tech_term in msg.lower() for tech_term in ["gemini", "status 5", "status 4", "proto", "api key", "syntaxerror", "exception", "httpx"]):
                    logger.error("Raw API error for notice %s logged to backend: %s", notice_id, msg)
                    msg = "Structured extraction failed. The AI service was unable to analyze this document. Please try again or provide a clearer notice."
                    notice.error_code = pipeline_res.get("error_code", "EXTRACTION_FAILED")
                else:
                    notice.error_code = pipeline_res.get("error_code", "EXTRACTION_FAILED")
                notice.error = msg
                notice.message = msg

            db.commit()

        except Exception as exc:
            db.rollback()
            logger.exception("Unexpected error in background pipeline for notice %s: %s", notice_id, exc)
            notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
            if notice:
                notice.status = "failed"
                notice.stage = "done"
                notice.progress = 100
                notice.error = "An error occurred while processing this document. Please try again."
                notice.error_code = "PROCESSING_ERROR"
                notice.message = "An error occurred while processing this document. Please try again."
                db.commit()
        finally:
            db.close()

    def list_notices(self, db: Session, user_id: str | None = None) -> list[dict[str, Any]]:
        """List notices scoped to authenticated user, newest first."""
        query = db.query(NoticeModel)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notices = query.order_by(NoticeModel.created_at.desc()).all()
        items = []

        for n in notices:
            title = n.original_filename
            deadline_summary = None
            notice_date = None
            deadlines_list = []

            if n.result_json and isinstance(n.result_json, dict):
                extracted_title = n.result_json.get("notice_title", {}).get("text")
                if extracted_title and extracted_title != "not_found":
                    title = extracted_title

                notice_date = n.result_json.get("notice_date")
                deadlines = n.result_json.get("deadlines") or []
                if isinstance(deadlines, list):
                    deadlines_list = deadlines
                if deadlines_list:
                    first_dl = deadlines_list[0].get("date") or (
                        "ASAP" if deadlines_list[0].get("urgency") == "asap" else deadlines_list[0].get("date_rule_text")
                    )
                    count = len(deadlines_list)
                    deadline_summary = f"{count} deadline(s), next: {first_dl}"

            items.append(
                {
                    "id": n.id,
                    "title": title,
                    "category": n.category,
                    "status": n.status,
                    "deadline_summary": deadline_summary,
                    "needs_verification": n.needs_verification,
                    "created_at": n.created_at.isoformat() if n.created_at else "",
                    "notice_date": notice_date,
                    "deadlines": deadlines_list,
                }
            )
        return items

    def get_notice_detail(
        self, db: Session, notice_id: str, user_id: str | None = None
    ) -> dict[str, Any] | None:
        """Fetch notice details, checklist items, and reminders, scoped by user_id."""
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return None

        checklist = [item.to_dict() for item in notice.checklist_items]
        reminders = [r.to_dict() for r in notice.reminders]

        is_finished = notice.status in ("complete", "processed", "partial", "failed", "out_of_scope", "needs_clearer_document")
        stage = "done" if is_finished else (notice.stage or "uploading")
        progress = 100 if is_finished else (notice.progress if notice.progress is not None else 10)

        res_json = notice.result_json if isinstance(notice.result_json, dict) else {}
        notice_date = res_json.get("notice_date")

        return {
            "id": notice.id,
            "notice_id": notice.id,
            "user_id": notice.user_id,
            "original_filename": notice.original_filename,
            "status": notice.status,
            "stage": stage,
            "progress": progress,
            "error": notice.error,
            "error_code": notice.error_code,
            "category": notice.category,
            "created_at": notice.created_at.isoformat() if notice.created_at else "",
            "needs_verification": notice.needs_verification,
            "message": notice.message,
            "notice_date": notice_date,
            "result": notice.result_json,
            "checklist": checklist,
            "reminders": reminders,
        }

    def get_notice_summary(
        self,
        db: Session,
        notice_id: str,
        lang: str = "en",
        user_id: str | None = None,
        llm_client: BaseLLMClient | None = None,
    ) -> dict[str, str] | None:
        """Fetch or generate multilingual simple summary for notice in requested language."""
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return None

        if lang not in ("en", "hi", "kn"):
            lang = "en"

        res_json = notice.result_json if isinstance(notice.result_json, dict) else {}
        summary_cache = res_json.get("summary_cache")
        if isinstance(summary_cache, dict) and lang in summary_cache:
            cached = summary_cache[lang]
            if isinstance(cached, dict) and any(cached.get(k) for k in ("what_is_this", "what_to_do", "by_when", "if_you_ignore")):
                return cached

        # Generate fresh summary using verified facts
        summary = generate_multilingual_summary(res_json, lang=lang, llm_client=llm_client)

        # Cache in notice.result_json under "summary_cache"
        new_res = dict(res_json)
        if "summary_cache" not in new_res or not isinstance(new_res["summary_cache"], dict):
            new_res["summary_cache"] = {}
        new_res["summary_cache"][lang] = summary
        notice.result_json = new_res
        flag_modified(notice, "result_json")
        try:
            db.commit()
            db.refresh(notice)
        except Exception as e:
            db.rollback()

        return summary

    def get_notice_page_text(
        self, db: Session, notice_id: str, page_number: int, user_id: str | None = None
    ) -> dict[str, Any] | None:
        """Extract text for a specific page of a notice scoped to user_id."""
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return None

        local_path = self.storage.get_local_path(notice.stored_path)
        if not local_path.exists():
            return None

        pages = extract_pages(local_path)
        for p in pages:
            if p.get("page_number") == page_number:
                return {
                    "page_number": page_number,
                    "text": p.get("text", ""),
                    "char_count": p.get("char_count", 0),
                }
        return None

    def get_notice_file_path(
        self, db: Session, notice_id: str, user_id: str | None = None
    ) -> tuple[Path, str] | None:
        """Return the on-disk file path and original filename for a notice scoped to user_id.

        If a camera photo color compilation PDF exists, returns the original color document.
        """
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return None

        # Prefer original color PDF if notice was uploaded from camera photos
        color_pdf = Path(notice.stored_path).parent / f"{notice_id}_color.pdf"
        if color_pdf.exists():
            return color_pdf, f"{notice_id}_original_photos.pdf"

        path = self.storage.get_local_path(notice.stored_path)
        if not path.exists():
            return None

        return path, notice.original_filename

    def get_notice_page_image_path(
        self, db: Session, notice_id: str, page_number: int, user_id: str | None = None
    ) -> tuple[Path, str] | None:
        """Return the original color photo or rendered page image for source evidence inspection."""
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return None

        p = self.storage.get_local_path(notice.stored_path)

        # 1. Check for original color photo of this page
        page_photo = p.parent / f"{notice_id}_page_{page_number}_color.jpg"
        if page_photo.exists():
            return page_photo, "image/jpeg"

        # 2. For standard PDF notices, render page at 150 DPI to a cached JPEG image
        if p.exists() and p.is_file():
            try:
                doc = pymupdf.open(p)
                if 1 <= page_number <= len(doc):
                    page = doc[page_number - 1]
                    rendered_path = p.parent / f"{notice_id}_page_{page_number}_rendered.jpg"
                    if not rendered_path.exists():
                        pix = page.get_pixmap(dpi=150)
                        pix.save(str(rendered_path))
                    doc.close()
                    return rendered_path, "image/jpeg"
                doc.close()
            except Exception:
                pass

        return None

    def delete_notice(
        self, db: Session, notice_id: str, user_id: str | None = None
    ) -> bool:
        """Delete notice and on-disk files scoped to user_id."""
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return False

        if notice.stored_path:
            p = self.storage.get_local_path(notice.stored_path)
            if p.exists() and p.is_file():
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass
            # Clean up all companion files (_color.pdf, _page_*_color.jpg, etc.)
            parent = p.parent
            if parent.exists():
                for comp in parent.glob(f"{notice_id}*"):
                    try:
                        comp.unlink(missing_ok=True)
                    except Exception:
                        pass

        db.delete(notice)
        db.commit()
        return True

    def update_checklist_item(
        self,
        db: Session,
        notice_id: str,
        item_key: str,
        status: str,
        user_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Set checklist item status scoped to user_id."""
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return None

        item = (
            db.query(ChecklistItemModel)
            .filter(
                ChecklistItemModel.notice_id == notice_id,
                ChecklistItemModel.item_key == item_key,
            )
            .first()
        )

        if not item:
            item = ChecklistItemModel(notice_id=notice_id, item_key=item_key, status=status)
            db.add(item)
        else:
            item.status = status

        db.commit()
        db.refresh(item)
        return item.to_dict()

    def create_reminder(
        self,
        db: Session,
        notice_id: str,
        deadline_ref: str | None,
        remind_on: date,
        note: str | None,
        user_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Create a new in-app deadline reminder scoped to user_id."""
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return None

        reminder = ReminderModel(
            id=f"rem-{uuid.uuid4().hex[:10]}",
            notice_id=notice_id,
            deadline_ref=deadline_ref,
            remind_on=datetime.combine(remind_on, datetime.min.time()),
            note=note,
            done=False,
        )
        db.add(reminder)
        db.commit()
        db.refresh(reminder)
        return reminder.to_dict()

    def list_reminders_for_notice(
        self, db: Session, notice_id: str, user_id: str | None = None
    ) -> list[dict[str, Any]] | None:
        """List all reminders associated with a given notice scoped to user_id."""
        query = db.query(NoticeModel).filter(NoticeModel.id == notice_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        notice = query.first()
        if not notice:
            return None

        return [r.to_dict() for r in notice.reminders]

        return [r.to_dict() for r in notice.reminders]

    def update_reminder(
        self,
        db: Session,
        reminder_id: str,
        done: bool | None = None,
        note: str | None = None,
        remind_on: date | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Update reminder completion, note, or trigger date scoped to user_id."""
        query = db.query(ReminderModel).join(NoticeModel, ReminderModel.notice_id == NoticeModel.id).filter(ReminderModel.id == reminder_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        reminder = query.first()
        if not reminder:
            return None

        if done is not None:
            reminder.done = done
        if note is not None:
            reminder.note = note
        if remind_on is not None:
            reminder.remind_on = datetime.combine(remind_on, datetime.min.time())

        db.commit()
        db.refresh(reminder)
        return reminder.to_dict()

    def delete_reminder(
        self, db: Session, reminder_id: str, user_id: str | None = None
    ) -> bool:
        """Delete an in-app reminder scoped to user_id."""
        query = db.query(ReminderModel).join(NoticeModel, ReminderModel.notice_id == NoticeModel.id).filter(ReminderModel.id == reminder_id)
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        reminder = query.first()
        if not reminder:
            return False

        db.delete(reminder)
        db.commit()
        return True

    def get_upcoming_reminders(
        self, db: Session, days: int = 7, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Retrieve active (done=False) reminders due within the specified horizon scoped to user."""
        today = datetime.now(timezone.utc).date()
        cutoff = today + timedelta(days=days)

        query = (
            db.query(ReminderModel)
            .join(NoticeModel, ReminderModel.notice_id == NoticeModel.id)
            .filter(
                ReminderModel.done.is_(False),
                ReminderModel.remind_on <= datetime.combine(cutoff, datetime.max.time()),
            )
        )
        if user_id:
            query = query.filter(NoticeModel.user_id == user_id)
        reminders = query.order_by(ReminderModel.remind_on.asc()).all()
        return [r.to_dict() for r in reminders]


# Default service singleton
notice_service = NoticeService()

__all__ = ["NoticeService", "NoticeServiceError", "notice_service"]
