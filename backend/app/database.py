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
    """Initialize database tables and run lightweight SQLite column migrations."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(notices);").fetchall()
            existing_cols = {row[1] for row in res}
            new_cols = [
                ("file_hash", "VARCHAR(64)"),
                ("stage", "VARCHAR(32)"),
                ("progress", "INTEGER"),
                ("error_code", "VARCHAR(64)"),
                ("error", "TEXT"),
            ]
            for col_name, col_type in new_cols:
                if col_name not in existing_cols:
                    conn.exec_driver_sql(f"ALTER TABLE notices ADD COLUMN {col_name} {col_type};")
        except Exception:
            pass
