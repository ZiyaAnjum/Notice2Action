from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables and .env file."""

    APP_NAME: str = "Notice to Action API"
    APP_VERSION: str = "1.0.0"
    ENV: str = "development"
    DEBUG: bool = True

    # Server binding
    HOST: str = "0.0.0.0"
    PORT: int = 8001

    # CORS configuration
    ALLOWED_ORIGINS: str | list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # Database (SQLite default for MVP, easily switched via DATABASE_URL env)
    DATABASE_URL: str = "sqlite:///./notice.db"

    # Security & Authentication
    SECRET_KEY: str = "development-insecure-secret-key-placeholder"
    JWT_SECRET: str = "development-insecure-jwt-secret-replace-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    # Frontend URL (for password reset & verification links)
    FRONTEND_URL: str = "http://localhost:5173"

    # Email Service (pluggable: console or smtp)
    EMAIL_BACKEND: str = "console"  # "console" | "smtp"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str = "noreply@notice2action.com"

    # LLM & Extraction Services
    LLM_API_KEY: str = "mock-llm-key-placeholder"
    LLM_MODEL: str = "gemini-1.5-pro"
    LLM_FALLBACK_MODEL: str | None = None

    # File uploads & storage
    STORAGE_BACKEND: str = "local"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 10

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()
