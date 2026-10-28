"""Database setup and session management for Notice to Action backend.

Uses SQLite by default via SQLAlchemy, designed for seamless migration to
PostgreSQL by updating the DATABASE_URL environment variable.
"""

from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.app.config import get_settings

settings = get_settings()

# Configure SQLite or PostgreSQL engine with connection pooling and URL normalization
db_url = settings.DATABASE_URL.strip()
engine_kwargs: dict[str, Any] = {}

if db_url.startswith("postgres://"):
    # SQLAlchemy requires postgresql:// or postgresql+psycopg2://
    db_url = "postgresql+psycopg2://" + db_url[len("postgres://") :]
elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
    db_url = "postgresql+psycopg2://" + db_url[len("postgresql://") :]

if db_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL / Supabase pooler options
    engine_kwargs["pool_pre_ping"] = True

engine = create_engine(db_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
