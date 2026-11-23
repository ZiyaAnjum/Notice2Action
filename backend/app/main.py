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
from backend.app.routers import api_router, api_v1_router, auth_router
from backend.app.routers.notices import router as notices_router
from backend.app.schemas import HealthResponse

settings = get_settings()

# Initialize database tables on module load
init_db()


def _get_system_diagnostics(db: Session | None = None) -> dict[str, Any]:
    """Collect comprehensive system health and dependency diagnostics."""
    warnings: list[str] = []

    # 1. Database check
    db_status = "connected"
    if db is not None:
        try:
            db.execute(text("SELECT 1"))
        except Exception as exc:
            db_status = f"disconnected: {exc}"
            warnings.append(f"Database unavailable: {exc}")

    # 2. Tesseract check
    from extraction.ocr import is_tesseract_installed

    tess_avail, tess_msg = is_tesseract_installed()
    tess_info: dict[str, Any] = {
        "available": tess_avail,
        "path": None,
        "version": None,
        "message": tess_msg,
    }
    if tess_avail:
        try:
            import pytesseract

            tess_info["path"] = getattr(pytesseract.pytesseract, "tesseract_cmd", "tesseract")
            try:
                tess_info["version"] = str(pytesseract.get_tesseract_version())
            except Exception:
                pass
        except Exception:
            pass
    else:
        warnings.append(
            "Tesseract OCR is not installed or not on system PATH. "
            "Scanned PDF notices and paper photos will use Gemini Vision fallback."
        )

    # 3. Gemini / LLM key check
    api_key = settings.LLM_API_KEY or ""
    is_placeholder = (
        not api_key
        or api_key in ("mock-llm-key-placeholder", "your_gemini_or_openai_api_key_here")
        or api_key.startswith("your_")
    )
    gemini_info: dict[str, Any] = {
        "configured": not is_placeholder,
        "model": settings.LLM_MODEL,
        "fallback_model": settings.LLM_FALLBACK_MODEL,
    }
    if is_placeholder:
        warnings.append(
            "LLM_API_KEY is not configured or using default placeholder. "
            "Set a valid Gemini API key in your .env to enable AI extraction."
        )

    return {
        "database": db_status,
        "tesseract": tess_info,
        "gemini": gemini_info,
        "warnings": warnings,
    }


def _print_startup_diagnostics() -> None:
    """Print clean startup diagnostics and friendly warnings to console."""
    diag = _get_system_diagnostics()
    print("=" * 64)
    print(f"[{settings.APP_NAME}] Startup Diagnostics (v{settings.APP_VERSION})")
    print(f"  * Environment:  {settings.ENV}")
    print(f"  * Server Port:  {settings.PORT} (API Base: http://localhost:{settings.PORT})")
    print(f"  * Database:     {diag['database']}")
    if diag["tesseract"]["available"]:
        v_str = f" (v{diag['tesseract']['version']})" if diag["tesseract"]["version"] else ""
        print(f"  * Tesseract:    Available at '{diag['tesseract']['path']}'{v_str}")
    else:
        print("  * Tesseract:    NOT FOUND (scanned notices will use Gemini Vision fallback)")
    if diag["gemini"]["configured"]:
        fb_str = (
            f", fallback: {diag['gemini']['fallback_model']}"
            if diag["gemini"]["fallback_model"]
            else ""
        )
        print(f"  * Gemini AI:    Configured (model: {diag['gemini']['model']}{fb_str})")
    else:
        print("  * Gemini AI:    KEY NOT SET (set LLM_API_KEY in .env)")

    if diag["warnings"]:
        print("\n[Notice2Action] Active Startup Warnings:")
        for w in diag["warnings"]:
            print(f"  [!] {w}")
    print("=" * 64 + "\n")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan context managing database and service lifecycle."""
    _print_startup_diagnostics()
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
    diag = _get_system_diagnostics(db)
    is_healthy = not diag["database"].startswith("disconnected")
    content = {
        "status": "healthy" if is_healthy else "unhealthy",
        "database": diag["database"],
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENV,
        "tesseract": diag["tesseract"],
        "gemini": diag["gemini"],
        "warnings": diag["warnings"],
    }
    if not is_healthy:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=content,
        )

    return content


# Include API routers
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(notices_router, prefix="/notices", tags=["notices"])
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
