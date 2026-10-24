"""API router registration."""

from fastapi import APIRouter

from backend.app.routers.notices import router as notices_router
from backend.app.routers.reminders import router as reminders_router

api_router = APIRouter(prefix="/api")
api_router.include_router(notices_router, prefix="/notices", tags=["notices"])
api_router.include_router(reminders_router, prefix="/reminders", tags=["reminders"])

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(notices_router, prefix="/notices", tags=["notices"])
api_v1_router.include_router(reminders_router, prefix="/reminders", tags=["reminders"])

__all__ = ["api_router", "api_v1_router"]
