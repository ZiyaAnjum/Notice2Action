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
    PORT: int = 8000

    # CORS configuration
    ALLOWED_ORIGINS: str | list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # Database (SQLite default for MVP, easily switched via DATABASE_URL env)
    DATABASE_URL: str = "sqlite:///./notice.db"

    # Supabase Configuration (Backend Only - never expose Service Role Key to frontend)
    SUPABASE_URL: str | None = None
    SUPABASE_ANON_KEY: str | None = None
    SUPABASE_SERVICE_ROLE_KEY: str | None = None

    # Connection Pooling Configuration (applied for PostgreSQL / Supabase)
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800  # Recycle idle pooled connections (seconds)

    # Security
    SECRET_KEY: str = "development-insecure-secret-key-placeholder"

    # LLM & Extraction Services
    LLM_API_KEY: str = "mock-llm-key-placeholder"
    LLM_MODEL: str = "gemini-1.5-pro"
    LLM_FALLBACK_MODEL: str | None = None

    # File uploads & storage
    STORAGE_BACKEND: str = "local"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 10

    # Rate Limiting (Upload endpoint protection)
    RATE_LIMIT_UPLOAD_MAX: int = 10  # Max upload requests per window
    RATE_LIMIT_UPLOAD_WINDOW_SEC: int = 60  # Time window in seconds
    RATE_LIMIT_ENABLED: bool = True

    # Pipeline processing
    PIPELINE_TIMEOUT_SEC: float = 120.0  # max seconds for background pipeline (default 2 min)
    POLL_INTERVAL_MS: int = 2000  # recommended client polling interval in ms

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @property
    def is_supabase_configured(self) -> bool:
        """Check whether Supabase environment credentials are configured."""
        return bool(
            self.SUPABASE_URL
            and (self.SUPABASE_ANON_KEY or self.SUPABASE_SERVICE_ROLE_KEY)
        )

    @property
    def is_postgres(self) -> bool:
        """Check whether the active DATABASE_URL targets PostgreSQL/Supabase."""
        url = self.DATABASE_URL.lower().strip()
        return url.startswith("postgres://") or url.startswith("postgresql")

    @property
    def database_type(self) -> str:
        """Return the dialect name of the active database ('postgresql' or 'sqlite')."""
        return "postgresql" if self.is_postgres else "sqlite"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()
