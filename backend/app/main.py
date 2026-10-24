"""FastAPI application entrypoint for Notice to Action backend."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.database import get_db, init_db
from backend.app.routers import api_router, api_v1_router
from backend.app.schemas import HealthResponse

settings = get_settings()

# Initialize database tables on module load
init_db()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan context managing database and service lifecycle."""
    init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API for Notice to Action: AI-driven official notice extraction and actionable execution.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Standardized error handling returning {error, error_code, message}
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        code = exc.detail.get("error") or exc.detail.get("error_code") or f"HTTP_{exc.status_code}"
        msg = exc.detail.get("message") or str(exc.detail)
        payload = {"error": code, "error_code": code, "message": msg}
    else:
        payload = {
            "error": f"HTTP_{exc.status_code}",
            "error_code": f"HTTP_{exc.status_code}",
            "message": str(exc.detail),
        }
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Always return friendly plain-language message, never raw stack trace per rules.md
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "error_code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected error occurred while processing your request. Please try again later.",
        },
    )


# Health check endpoints
@app.get("/health", response_model=HealthResponse, summary="Health Check (Legacy)", tags=["system"])
@app.get("/api/health", response_model=HealthResponse, summary="Health Check", tags=["system"])
async def health_check(
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any] | JSONResponse:
    """Health endpoint returning operational status, service metadata, and database connectivity."""
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"disconnected: {exc}"
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "database": db_status,
                "app": settings.APP_NAME,
                "version": settings.APP_VERSION,
                "environment": settings.ENV,
            },
        )

    return {
        "status": "healthy",
        "database": db_status,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENV,
    }


# Include API routers
app.include_router(api_router)
app.include_router(api_v1_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
