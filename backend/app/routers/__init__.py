from fastapi import APIRouter
from backend.app.routers.notices import router as notices_router

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(notices_router, prefix="/notices", tags=["notices"])

__all__ = ["api_v1_router"]
