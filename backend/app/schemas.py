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
    notice_id: str | None = Field(None, description="Notice ID alias for UI consistency")
    status: str = Field(..., description="Initial processing status (e.g. 'processing')")
    stage: str | None = Field("uploading", description="Current stage: uploading, reading_text, understanding, checking, done")
    progress: int | None = Field(10, description="Estimated completion percentage 0-100")
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
    notice_id: str | None = None
    original_filename: str
    status: str
    stage: str | None = "done"
    progress: int | None = 100
    error: str | None = None
    error_code: str | None = None
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


# --- Authentication & User Schemas ---


class SignupRequest(BaseModel):
    """Signup payload."""

    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Login credentials payload."""

    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
    """Sanitized user profile response."""

    id: str
    email: str
    full_name: str
    is_verified: bool = False
    preferred_language: str = "en"
    is_demo: bool = False
    created_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """JWT access token and user profile response."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ForgotPasswordRequest(BaseModel):
    """Password reset request payload."""

    email: str = Field(..., min_length=5, max_length=255)


class ResetPasswordRequest(BaseModel):
    """Password reset completion payload."""

    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class UpdateProfileRequest(BaseModel):
    """Profile update payload."""

    full_name: str | None = Field(None, min_length=2, max_length=100)
    preferred_language: str | None = Field(None, max_length=10)


class ChangePasswordRequest(BaseModel):
    """Password update payload."""

    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class SuccessMessageResponse(BaseModel):
    """Generic action confirmation envelope."""

    message: str
    status: str = "success"
