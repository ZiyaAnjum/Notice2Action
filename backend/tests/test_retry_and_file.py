"""Integration tests for notice retry extraction and file serving endpoints."""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import NoticeModel, UserModel
from backend.app.services.notice_service import notice_service
from backend.app.security import create_access_token, hash_password


@pytest.fixture
def auth_context(tmp_path: Path) -> tuple[dict[str, str], int]:
    """Create a test user and return Authorization headers and user id."""
    db = notice_service.session_factory()
    try:
        user = UserModel(
            email="testuser@example.com",
            hashed_password=hash_password("Password123!"),
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        token = create_access_token({"sub": str(user.id), "email": user.email})
        return {"Authorization": f"Bearer {token}"}, user.id
    finally:
        db.close()


def test_retry_endpoint_requires_auth():
    client = TestClient(app)
    resp = client.post("/api/notices/some-id/retry")
    assert resp.status_code == 401


def test_retry_endpoint_enqueues_and_returns_processing(auth_context):
    headers, user_id = auth_context
    client = TestClient(app)
    db = notice_service.session_factory()
    try:
        # Create a sample notice in failed state
        notice = NoticeModel(
            id="notice-failed-retry",
            user_id=user_id,
            filename="notice.pdf",
            status="failed",
            error_message="Simulated extraction failure",
        )
        db.add(notice)
        db.commit()
    finally:
        db.close()

    resp = client.post("/api/notices/notice-failed-retry/retry", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "notice-failed-retry"
    assert data["status"] == "processing"


def test_file_endpoint_serves_inline_with_proper_media_type(auth_context):
    headers, user_id = auth_context
    client = TestClient(app)

    # Create dummy pdf file in notice_service.upload_dir
    dummy_pdf = notice_service.upload_dir / "sample_notice.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.4 dummy pdf content")

    db = notice_service.session_factory()
    try:
        notice = NoticeModel(
            id="notice-pdf-view",
            user_id=user_id,
            filename="sample_notice.pdf",
            status="complete",
        )
        db.add(notice)
        db.commit()
    finally:
        db.close()

    resp = client.get("/api/notices/notice-pdf-view/file", headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "inline" in resp.headers.get("content-disposition", "")
    assert resp.content == b"%PDF-1.4 dummy pdf content"


def test_file_endpoint_returns_404_when_file_not_found(auth_context):
    headers, _ = auth_context
    client = TestClient(app)
    resp = client.get("/api/notices/non-existent-id/file", headers=headers)
    assert resp.status_code == 404
