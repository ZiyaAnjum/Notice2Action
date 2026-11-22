"""SQLAlchemy models for notices, checklist items, and reminders."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.app.database import Base


class NoticeModel(Base):
    """SQLAlchemy model representing an uploaded and processed notice."""

    __tablename__ = "notices"

    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    original_filename = Column(String(255), nullable=False)
    stored_path = Column(String(512), nullable=False)
    file_hash = Column(String(64), nullable=True, index=True)
    status = Column(String(64), nullable=False, default="processing", index=True)
    stage = Column(String(32), nullable=True, default="uploading")
    progress = Column(Integer, nullable=True, default=10)
    error_code = Column(String(64), nullable=True)
    error = Column(Text, nullable=True)
    category = Column(String(64), nullable=True, index=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    result_json = Column(JSON, nullable=True)
    needs_verification = Column(Boolean, default=False, nullable=False)
    message = Column(Text, nullable=True)

    # Relationships with automatic cascade deletion
    user = relationship("UserModel", back_populates="notices")
    checklist_items = relationship(
        "ChecklistItemModel",
        back_populates="notice",
        cascade="all, delete-orphan",
        order_by="ChecklistItemModel.id",
    )
    reminders = relationship(
        "ReminderModel",
        back_populates="notice",
        cascade="all, delete-orphan",
        order_by="ReminderModel.remind_on",
    )

    def to_dict(self) -> dict[str, Any]:
        """Convert Notice model instance to dictionary representation."""
        is_finished = self.status in ("complete", "processed", "partial", "failed", "out_of_scope", "needs_clearer_document")
        default_stage = "done" if is_finished else (self.stage or "uploading")
        default_progress = 100 if is_finished else (self.progress if self.progress is not None else 10)

        return {
            "id": self.id,
            "notice_id": self.id,
            "user_id": self.user_id,
            "original_filename": self.original_filename,
            "stored_path": self.stored_path,
            "file_hash": self.file_hash,
            "status": self.status,
            "stage": default_stage,
            "progress": default_progress,
            "error_code": self.error_code,
            "error": self.error,
            "category": self.category,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "result_json": self.result_json,
            "needs_verification": self.needs_verification,
            "message": self.message,
        }


class ChecklistItemModel(Base):
    """SQLAlchemy model tracking actionable checklist document/step statuses."""

    __tablename__ = "checklist_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notice_id = Column(
        String(64), ForeignKey("notices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_key = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="not_completed")

    notice = relationship("NoticeModel", back_populates="checklist_items")

    def to_dict(self) -> dict[str, Any]:
        """Convert Checklist item model instance to dictionary representation."""
        return {
            "id": self.id,
            "notice_id": self.notice_id,
            "item_key": self.item_key,
            "status": self.status,
        }


class ReminderModel(Base):
    """SQLAlchemy model tracking in-app reminders for notice deadlines."""

    __tablename__ = "reminders"

    id = Column(String(64), primary_key=True, index=True)
    notice_id = Column(
        String(64), ForeignKey("notices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    deadline_ref = Column(String(255), nullable=True)
    remind_on = Column(DateTime, nullable=False)
    note = Column(Text, nullable=True)
    done = Column(Boolean, default=False, nullable=False)

    notice = relationship("NoticeModel", back_populates="reminders")

    def to_dict(self) -> dict[str, Any]:
        """Convert Reminder model instance to dictionary representation."""
        return {
            "id": self.id,
            "notice_id": self.notice_id,
            "deadline_ref": self.deadline_ref,
            "remind_on": self.remind_on.date().isoformat() if self.remind_on else None,
            "note": self.note,
            "done": self.done,
        }
