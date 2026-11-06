"""Service layer for notice management, file storage, and pipeline execution."""

import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.database import SessionLocal
from backend.app.models.notice import ChecklistItemModel, NoticeModel, ReminderModel
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
        self, filename: str, contents: bytes, content_type: str | None
    ) -> tuple[str, Path]:
        """Validate uploaded PDF bytes and persist to a private, non-public directory.

        Args:
            filename: Original user filename (for display only).
            contents: Raw file byte stream.
            content_type: Header content-type string.

        Returns:
            Tuple of (unique notice_id, safe saved local Path).

        Raises:
            NoticeServiceError: On format, magic byte, size, or emptiness violations.
        """
        # 1. Content-type check
        if content_type != "application/pdf":
            raise NoticeServiceError(
                error_code="INVALID_FILE_TYPE",
                message=f"Only PDF documents are supported. Received content-type: '{content_type}'.",
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

        # 5. Save with random safe UUID filename outside any public path via FileStorage
        stored_path_str = self.storage.save(filename, contents)
        stored_path = Path(stored_path_str)

        notice_id = f"notice-{uuid.uuid4().hex[:12]}"
        return notice_id, stored_path

    def create_pending_notice(
        self,
        db: Session,
        notice_id: str,
        filename: str,
        stored_path: Path,
    ) -> NoticeModel:
        """Create initial database notice record with 'processing' status."""
        # NOTE(ownership): In multi-user deployment, assign request.state.user_id as owner here
        notice = NoticeModel(
            id=notice_id,
            original_filename=filename,
            stored_path=str(stored_path.resolve()),
            status="processing",
            created_at=datetime.now(timezone.utc),
            needs_verification=False,
            message="Notice uploaded and queued for processing.",
        )
        db.add(notice)
        db.commit()
        db.refresh(notice)
        return notice

    def run_background_pipeline(
        self,
        notice_id: str,
        stored_path: str,
        llm_client: BaseLLMClient | None = None,
    ) -> None:
        """Execute processing pipeline in background and record structured results."""
        session_maker = self.session_factory or SessionLocal
        db: Session = session_maker()
        try:
            pipeline_res = process_notice(stored_path, client=llm_client)

            notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
            if not notice:
                return

            pipe_status = pipeline_res["status"]

            if pipe_status == "success":
                notice.status = "processed"
                notice.category = pipeline_res["category"]
                notice.result_json = pipeline_res["result"]
                notice.needs_verification = pipeline_res["needs_verification"]
                notice.message = pipeline_res.get("message", "Processed successfully.")

                # Populate initial checklist items from extracted required documents
                docs = (pipeline_res["result"] or {}).get("required_documents") or []
                for idx, doc in enumerate(docs):
                    doc_name = doc.get("name") or f"Document {idx + 1}"
                    # Default checklist status
                    checklist_item = ChecklistItemModel(
                        notice_id=notice.id,
                        item_key=doc_name,
                        status="not_completed",
                    )
                    db.add(checklist_item)

            elif pipe_status == "needs_clearer_document":
                notice.status = "needs_clearer_document"
                notice.category = "other_out_of_scope"
                notice.needs_verification = True
                notice.message = pipeline_res.get("message")

            elif pipe_status == "out_of_scope":
                notice.status = "out_of_scope"
                notice.category = "other_out_of_scope"
                notice.needs_verification = False
                notice.message = pipeline_res.get("message")

            else:
                notice.status = "extraction_failed"
                notice.needs_verification = True
                msg = str(pipeline_res.get("message", "Extraction failed."))
                if "API key" in msg or "not configured" in msg:
                    notice.message = (
                        "AI extraction service is not configured. Please set LLM_API_KEY."
                    )
                else:
                    notice.message = msg

            db.commit()

        except Exception as exc:
            db.rollback()
            notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
            if notice:
                notice.status = "extraction_failed"
                notice.needs_verification = True
                err_msg = str(exc)
                if "API key" in err_msg or "not configured" in err_msg:
                    notice.message = (
                        "AI extraction service is not configured. Please set LLM_API_KEY."
                    )
                else:
                    notice.message = f"Processing error: {err_msg}"
                db.commit()
        finally:
            db.close()

    def list_notices(self, db: Session) -> list[dict[str, Any]]:
        """List all notices, newest first, with summary details."""
        # NOTE(ownership): In multi-user deployment, filter by NoticeModel.owner_id == user_id here
        notices = db.query(NoticeModel).order_by(NoticeModel.created_at.desc()).all()
        items = []

        for n in notices:
            title = n.original_filename
            deadline_summary = None

            if n.result_json and isinstance(n.result_json, dict):
                extracted_title = n.result_json.get("notice_title", {}).get("text")
                if extracted_title and extracted_title != "not_found":
                    title = extracted_title

                deadlines = n.result_json.get("deadlines") or []
                if deadlines:
                    first_dl = deadlines[0].get("date")
                    count = len(deadlines)
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
                }
            )
        return items

    def get_notice_detail(self, db: Session, notice_id: str) -> dict[str, Any] | None:
        """Fetch notice details, checklist items, and reminders."""
        # NOTE(ownership): In multi-user deployment, verify notice.owner_id == user_id here
        notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
        if not notice:
            return None

        checklist = [item.to_dict() for item in notice.checklist_items]
        reminders = [r.to_dict() for r in notice.reminders]

        return {
            "id": notice.id,
            "original_filename": notice.original_filename,
            "status": notice.status,
            "category": notice.category,
            "created_at": notice.created_at.isoformat() if notice.created_at else "",
            "needs_verification": notice.needs_verification,
            "message": notice.message,
            "result": notice.result_json,
            "checklist": checklist,
            "reminders": reminders,
        }

    def get_notice_page_text(
        self, db: Session, notice_id: str, page_number: int
    ) -> dict[str, Any] | None:
        """Extract text for a specific page of a notice."""
        # NOTE(ownership): In multi-user deployment, verify notice.owner_id == user_id here
        notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
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

    def get_notice_file_path(self, db: Session, notice_id: str) -> tuple[Path, str] | None:
        """Return the on-disk file path and original filename for a notice."""
        # NOTE(ownership): In multi-user deployment, verify notice.owner_id == user_id here
        notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
        if not notice:
            return None

        path = self.storage.get_local_path(notice.stored_path)
        if not path.exists():
            return None

        return path, notice.original_filename

    def update_checklist_item(
        self,
        db: Session,
        notice_id: str,
        item_key: str,
        status: str,
    ) -> dict[str, Any] | None:
        """Set checklist item status (not_completed / completed / needs_verification)."""
        # NOTE(ownership): In multi-user deployment, verify notice.owner_id == user_id here
        notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
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
    ) -> dict[str, Any] | None:
        """Create a new in-app deadline reminder."""
        # NOTE(ownership): In multi-user deployment, verify notice.owner_id == user_id here
        notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
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

    def list_reminders_for_notice(self, db: Session, notice_id: str) -> list[dict[str, Any]] | None:
        """List all reminders associated with a given notice."""
        # NOTE(ownership): In multi-user deployment, verify notice.owner_id == user_id here
        notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
        if not notice:
            return None

        return [r.to_dict() for r in notice.reminders]

    def update_reminder(
        self,
        db: Session,
        reminder_id: str,
        done: bool | None = None,
        note: str | None = None,
        remind_on: date | None = None,
    ) -> dict[str, Any] | None:
        """Update reminder completion, note, or trigger date."""
        reminder = db.query(ReminderModel).filter(ReminderModel.id == reminder_id).first()
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

    def delete_reminder(self, db: Session, reminder_id: str) -> bool:
        """Delete an in-app reminder."""
        reminder = db.query(ReminderModel).filter(ReminderModel.id == reminder_id).first()
        if not reminder:
            return False

        db.delete(reminder)
        db.commit()
        return True

    def get_upcoming_reminders(self, db: Session, days: int = 7) -> list[dict[str, Any]]:
        """Retrieve active (done=False) reminders due within the specified horizon."""
        today = datetime.now(timezone.utc).date()
        cutoff = today + timedelta(days=days)

        reminders = (
            db.query(ReminderModel)
            .filter(
                ReminderModel.done.is_(False),
                ReminderModel.remind_on <= datetime.combine(cutoff, datetime.max.time()),
            )
            .order_by(ReminderModel.remind_on.asc())
            .all()
        )
        return [r.to_dict() for r in reminders]

    def delete_notice(self, db: Session, notice_id: str) -> bool:
        """Delete a notice, its physical file from storage, and associated records."""
        # NOTE(ownership): In multi-user deployment, verify notice.owner_id == user_id here
        notice = db.query(NoticeModel).filter(NoticeModel.id == notice_id).first()
        if not notice:
            return False

        # 1. Delete physical file via FileStorage
        self.storage.delete(notice.stored_path)

        # 2. Delete database record (cascades to checklist and reminders)
        db.delete(notice)
        db.commit()
        return True


# Default service singleton
notice_service = NoticeService()

__all__ = ["NoticeService", "NoticeServiceError", "notice_service"]
