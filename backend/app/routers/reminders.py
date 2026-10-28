"""API router for standalone reminder operations and upcoming notifications."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.schemas import ReminderResponse, ReminderUpdateRequest
from backend.app.services.notice_service import notice_service

router = APIRouter()


@router.get(
    "/upcoming",
    response_model=list[ReminderResponse],
    summary="Get upcoming active reminders",
    description="Returns active (undone) reminders due within the specified horizon in days (default 7).",
)
async def get_upcoming_reminders(
    db: Annotated[Session, Depends(get_db)],
    days: Annotated[int, Query(ge=1, le=365, description="Number of days ahead to look")] = 7,
) -> list[ReminderResponse]:
    """Retrieve upcoming reminders for dashboard alerts."""
    reminders = notice_service.get_upcoming_reminders(db, days=days)
    return [ReminderResponse(**r) for r in reminders]


@router.patch(
    "/{reminder_id}",
    response_model=ReminderResponse,
    summary="Update reminder status or details",
    description="Updates reminder completion status, note, or scheduled date.",
)
async def update_reminder(
    reminder_id: str,
    payload: ReminderUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
) -> ReminderResponse:
    """Update an existing reminder."""
    updated = notice_service.update_reminder(
        db=db,
        reminder_id=reminder_id,
        done=payload.done,
        note=payload.note,
        remind_on=payload.remind_on,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "REMINDER_NOT_FOUND",
                "message": f"Reminder '{reminder_id}' was not found.",
            },
        )
    return ReminderResponse(**updated)


@router.delete(
    "/{reminder_id}",
    summary="Delete reminder",
    description="Permanently deletes an individual reminder.",
)
async def delete_reminder(
    reminder_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Delete a reminder by ID."""
    success = notice_service.delete_reminder(db, reminder_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "REMINDER_NOT_FOUND",
                "message": f"Reminder '{reminder_id}' was not found.",
            },
        )
    return {"status": "deleted", "id": reminder_id}
