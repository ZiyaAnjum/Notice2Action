"""Pydantic schemas for API request and response validation."""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    """Standard user-friendly error envelope."""

    error: str = Field(..., description="Error identifier code")
    message: str = Field(..., description="Plain-language human-readable error description")


class NoticeUploadResponse(BaseModel):
    """Response returned upon successful PDF notice upload and background queuing."""

    id: str = Field(..., description="Unique notice record identifier")
    status: str = Field(..., description="Initial processing status (e.g. 'processing')")
    message: str = Field(..., description="Status summary message")


class NoticeListItem(BaseModel):
    """Compact notice item for list views."""

    id: str = Field(..., description="Unique notice identifier")
    title: str = Field(..., description="Official title or fallback file name")
    category: str | None = Field(None, description="Categorization or None")
    status: str = Field(..., description="Processing status")
    deadline_summary: str | None = Field(None, description="Summary of upcoming deadlines")
    needs_verification: bool = Field(False, description="Verification caution flag")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")


class ChecklistItemResponse(BaseModel):
    """Checklist item tracking required document or procedural step status."""

    id: int | None = None
    notice_id: str
    item_key: str
    status: Literal["not_completed", "completed", "needs_verification"]

    model_config = ConfigDict(from_attributes=True)


class ChecklistUpdateRequest(BaseModel):
    """Request payload to update checklist item status."""

    status: Literal["not_completed", "completed", "needs_verification"] = Field(
        ..., description="Updated checklist status"
    )


class ReminderCreateRequest(BaseModel):
    """Request payload to create a new reminder."""

    deadline_ref: str | None = Field(None, description="Associated deadline label or description")
    remind_on: date = Field(..., description="Calendar date on which to trigger the reminder")
    note: str | None = Field(None, description="Optional custom reminder note")


class ReminderUpdateRequest(BaseModel):
    """Request payload to update an existing reminder."""

    done: bool | None = Field(None, description="Mark as completed or active")
    note: str | None = Field(None, description="Updated reminder note")
    remind_on: date | None = Field(None, description="Updated trigger date")


class ReminderResponse(BaseModel):
    """Reminder details response."""

    id: str
    notice_id: str
    deadline_ref: str | None = None
    remind_on: str
    note: str | None = None
    done: bool = False

    model_config = ConfigDict(from_attributes=True)


class NoticeDetailResponse(BaseModel):
    """Complete notice record including extracted JSON, checklist, and reminders."""

    id: str
    original_filename: str
    status: str
    category: str | None = None
    created_at: str
    needs_verification: bool = False
    message: str | None = None
    result: dict[str, Any] | None = None
    checklist: list[ChecklistItemResponse] = []
    reminders: list[ReminderResponse] = []


class PageTextResponse(BaseModel):
    """Extracted text of a single source page for passage viewing."""

    page_number: int
    text: str
    char_count: int


class HealthResponse(BaseModel):
    """API health check response."""

    status: str = "healthy"
    database: str = "connected"
    version: str = "1.0.0"
    app: str = "Notice to Action API"
    environment: str = "development"
