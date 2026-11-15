"""Tests for Supabase / PostgreSQL database configuration, connectivity, and health reporting."""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from backend.app.config import Settings
from backend.app.database import (
    build_engine_kwargs,
    check_db_connection,
    get_db,
    normalize_database_url,
)
from backend.app.main import app

client = TestClient(app)


def test_sqlite_configuration_and_compatibility() -> None:
    """Verify default configuration targets SQLite with correct non-pooling options."""
    settings = Settings(DATABASE_URL="sqlite:///./test.db")
    assert settings.database_type == "sqlite"
    assert settings.is_postgres is False

    kwargs = build_engine_kwargs(settings.DATABASE_URL, settings)
    assert kwargs.get("connect_args") == {"check_same_thread": False}
    assert "pool_size" not in kwargs


def test_postgresql_and_supabase_url_normalization() -> None:
    """Verify PostgreSQL and Supabase pooler URLs are normalized to psycopg2 driver."""
    # Standard postgres:// prefix (common in cloud providers)
    url1 = "postgres://postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
    assert normalize_database_url(url1).startswith("postgresql+psycopg2://")

    # Driverless postgresql://
    url2 = "postgresql://postgres:secret@db.abc.supabase.co:5432/postgres"
    assert normalize_database_url(url2).startswith("postgresql+psycopg2://")

    # Explicit driver postgresql+psycopg2:// preserved
    url3 = "postgresql+psycopg2://postgres:secret@localhost:5432/postgres"
    assert normalize_database_url(url3) == url3

    # SQLite preserved as-is
    url4 = "sqlite:///./notice.db"
    assert normalize_database_url(url4) == url4


def test_supabase_pooling_kwargs() -> None:
    """Verify Supabase/PostgreSQL connection pooling options are properly configured."""
    settings = Settings(
        DATABASE_URL="postgresql://postgres:secret@localhost:5432/postgres",
        DB_POOL_SIZE=8,
        DB_MAX_OVERFLOW=15,
        DB_POOL_TIMEOUT=45,
        DB_POOL_RECYCLE=1200,
    )
    assert settings.is_postgres is True
    assert settings.database_type == "postgresql"

    kwargs = build_engine_kwargs(settings.DATABASE_URL, settings)
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["pool_size"] == 8
    assert kwargs["max_overflow"] == 15
    assert kwargs["pool_timeout"] == 45
    assert kwargs["pool_recycle"] == 1200


def test_missing_supabase_credentials() -> None:
    """Verify is_supabase_configured reports False when Supabase environment variables are missing."""
    # Neither URL nor keys
    s1 = Settings(SUPABASE_URL=None, SUPABASE_ANON_KEY=None, SUPABASE_SERVICE_ROLE_KEY=None)
    assert s1.is_supabase_configured is False

    # URL only, missing keys
    s2 = Settings(
        SUPABASE_URL="https://project-id.supabase.co",
        SUPABASE_ANON_KEY=None,
        SUPABASE_SERVICE_ROLE_KEY=None,
    )
    assert s2.is_supabase_configured is False

    # Keys only, missing URL
    s3 = Settings(
        SUPABASE_URL=None,
        SUPABASE_ANON_KEY="some-anon-key",
        SUPABASE_SERVICE_ROLE_KEY=None,
    )
    assert s3.is_supabase_configured is False


def test_present_supabase_credentials() -> None:
    """Verify is_supabase_configured reports True when URL and a key are provided."""
    s1 = Settings(
        SUPABASE_URL="https://project-id.supabase.co",
        SUPABASE_ANON_KEY="anon-key-abc",
        SUPABASE_SERVICE_ROLE_KEY=None,
    )
    assert s1.is_supabase_configured is True

    s2 = Settings(
        SUPABASE_URL="https://project-id.supabase.co",
        SUPABASE_ANON_KEY=None,
        SUPABASE_SERVICE_ROLE_KEY="service-role-key-xyz",
    )
    assert s2.is_supabase_configured is True


def test_database_connection_success_sqlite() -> None:
    """Verify live connectivity check returns success on active database."""
    connected, message = check_db_connection()
    assert connected is True
    assert message == "connected"


def test_database_connection_failure_mocked() -> None:
    """Verify connectivity check reports disconnected when an operational error occurs."""
    mock_engine = MagicMock()
    mock_engine.connect.side_effect = OperationalError(
        statement="SELECT 1",
        params={},
        orig=Exception("Could not connect to server: Connection refused"),
    )

    connected, message = check_db_connection(target_engine=mock_engine)
    assert connected is False
    assert "disconnected" in message
    assert "Connection refused" in message


def test_health_endpoint_response() -> None:
    """Verify /api/health and /health return 200 with database status and configuration."""
    for path in ("/health", "/api/health"):
        res = client.get(path)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        assert data["database_type"] in ("sqlite", "postgresql")
        assert isinstance(data["supabase_configured"], bool)


def test_health_endpoint_reports_unhealthy_when_database_fails() -> None:
    """Verify health endpoint returns 503 and status=unhealthy if database connectivity fails."""
    mock_db = MagicMock()
    mock_db.execute.side_effect = Exception("Supabase pooler closed connection")

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        res = client.get("/api/health")
        assert res.status_code == 503
        data = res.json()
        assert data["status"] == "unhealthy"
        assert "disconnected" in data["database"]
        assert "Supabase pooler" in data["database"]
    finally:
        app.dependency_overrides.pop(get_db, None)
