"""Database table creation script for Notice to Action.

Connects to the database specified by DATABASE_URL (SQLite or PostgreSQL / Supabase)
and creates all required tables (notices, checklist_items, reminders) using SQLAlchemy metadata.

Usage:
    python scripts/create_tables.py
"""

import sys
from pathlib import Path

from sqlalchemy import text

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Ensure models are imported so they register with Base.metadata
import backend.app.models  # noqa: E402, F401
from backend.app.config import get_settings  # noqa: E402
from backend.app.database import Base, engine  # noqa: E402


def create_all_tables() -> int:
    """Create all database tables and verify connection."""
    settings = get_settings()
    masked_url = settings.DATABASE_URL
    if "@" in masked_url:
        prefix, host_part = masked_url.split("@", 1)
        scheme_and_user = prefix.split(":", 1)[0]
        masked_url = f"{scheme_and_user}:***@{host_part}"

    print(f"[*] Target database: {masked_url}")
    print(f"[*] Dialect: {engine.dialect.name}")

    # 1. Verify connectivity with SELECT 1
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1")).scalar()
            if result != 1:
                print(f"[!] Warning: Unexpected SELECT 1 result: {result}")
            else:
                print("[+] Connection verified successfully (SELECT 1 passed).")
    except Exception as exc:
        print(f"[-] Database connection failed: {exc}", file=sys.stderr)
        return 1

    # 2. Create tables
    print("[*] Creating tables from SQLAlchemy metadata...")
    Base.metadata.create_all(bind=engine)

    # 3. List registered tables
    table_names = list(Base.metadata.tables.keys())
    print(f"[+] Successfully ensured tables exist: {', '.join(table_names)}")
    print("[+] Database is ready for Notice to Action.")
    return 0


if __name__ == "__main__":
    sys.exit(create_all_tables())
