"""Database setup and session management for Notice to Action backend.

Uses SQLite by default via SQLAlchemy, designed for seamless migration to
PostgreSQL by updating the DATABASE_URL environment variable.
"""

from collections.abc import Generator
from typing import Any

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.app.config import Settings, get_settings

settings = get_settings()


def normalize_database_url(raw_url: str) -> str:
    """Normalize raw database connection URL for SQLAlchemy compatibility.

    Converts legacy 'postgres://' or driverless 'postgresql://' to 'postgresql+psycopg2://'
    while preserving sqlite and custom driver specifications.
    """
    url = raw_url.strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        return "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


def build_engine_kwargs(url: str, app_settings: Settings | None = None) -> dict[str, Any]:
    """Build engine connection and pooling options suitable for SQLite or Supabase/PostgreSQL."""
    cfg = app_settings or settings
    kwargs: dict[str, Any] = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Supabase / PostgreSQL connection pooler settings
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = cfg.DB_POOL_RECYCLE
        kwargs["pool_size"] = cfg.DB_POOL_SIZE
        kwargs["max_overflow"] = cfg.DB_MAX_OVERFLOW
        kwargs["pool_timeout"] = cfg.DB_POOL_TIMEOUT
    return kwargs


# Configure active database engine
db_url = normalize_database_url(settings.DATABASE_URL)
engine_kwargs = build_engine_kwargs(db_url, settings)

engine: Engine = create_engine(db_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def check_db_connection(target_engine: Engine | None = None) -> tuple[bool, str]:
    """Execute a lightweight test query to verify live database connectivity.

    Returns:
        (is_connected, status_message)
    """
    eng = target_engine or engine
    try:
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "connected"
    except Exception as exc:
        return False, f"disconnected: {exc}"


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy ORM models."""

    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding an isolated SQLAlchemy database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Initialize database tables and ensure all columns exist."""
    Base.metadata.create_all(bind=engine)
    # Ensure backward compatibility for databases created before current_stage/progress
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT current_stage, progress FROM notices LIMIT 1"))
    except Exception:
        try:
            with engine.connect() as conn:
                conn.execute(
                    text("ALTER TABLE notices ADD COLUMN current_stage VARCHAR(64) DEFAULT 'uploaded'")
                )
                conn.execute(text("ALTER TABLE notices ADD COLUMN progress INTEGER DEFAULT 0"))
                conn.commit()
        except Exception:
            pass
