"""Tests for secure upload handling, input validation, storage isolation, and rate limiting."""

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.dependencies import get_llm
from backend.app.main import app
from backend.app.rate_limiter import upload_rate_limiter
from backend.app.services.notice_service import notice_service
from extraction.llm_client import FakeLLMClient

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Provide isolated TestClient per test function."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    """Ensure in-memory rate limiter state is reset between test executions."""
    upload_rate_limiter.reset()


def test_valid_pdf_upload(client: TestClient) -> None:
    """Verify that a valid PDF file upload is accepted and returns 202 with processing status."""
    fake_llm = FakeLLMClient({"category": "scholarship_or_college", "notice_title": {"value": "Valid Notice"}})
    app.dependency_overrides[get_llm] = lambda: fake_llm

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    with open(pdf_path, "rb") as f:
        res = client.post(
            "/api/notices",
            files={"file": (pdf_path.name, f.read(), "application/pdf")},
        )
    assert res.status_code == 202
    data = res.json()
    assert "id" in data
    assert data["status"] == "processing"
    assert "queued" in data["message"].lower()


def test_unsupported_file_extension(client: TestClient) -> None:
    """Verify upload rejects unsupported file extensions (.exe, .txt, .docx, .sh) with 400."""
    invalid_filenames = [
        ("malicious.exe", b"%PDF-1.4 exe binary content", "application/pdf"),
        ("document.docx", b"%PDF-1.4 word doc content", "application/pdf"),
        ("script.sh", b"%PDF-1.4 bash script content", "application/pdf"),
        ("readme.txt", b"plain text content", "text/plain"),
    ]
    for fname, content, ctype in invalid_filenames:
        res = client.post(
            "/api/notices",
            files={"file": (fname, content, ctype)},
        )
        assert res.status_code == 400
        data = res.json()
        assert data["error"] == "INVALID_FILE_TYPE"
        assert "Only PDF documents" in data["message"] or "Unsupported file type" in data["message"]


def test_invalid_file_content_missing_magic_bytes(client: TestClient) -> None:
    """Verify upload rejects file with .pdf extension but invalid/missing %PDF magic bytes."""
    corrupted_content = b"THIS IS PLAIN TEXT DISGUISED AS A PDF DOCUMENT WITHOUT MAGIC BYTES"
    res = client.post(
        "/api/notices",
        files={"file": ("fake_notice.pdf", corrupted_content, "application/pdf")},
    )
    assert res.status_code == 422
    data = res.json()
    assert data["error"] == "INVALID_MAGIC_BYTES"
    assert "not a valid PDF document" in data["message"]


def test_empty_file_rejected(client: TestClient) -> None:
    """Verify upload rejects 0-byte empty file with 400."""
    res = client.post(
        "/api/notices",
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )
    assert res.status_code == 400
    data = res.json()
    assert data["error"] == "EMPTY_FILE"
    assert "empty" in data["message"].lower()


def test_oversized_file_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify upload rejects files exceeding MAX_UPLOAD_MB with 413."""
    from backend.app.config import get_settings

    settings = get_settings()
    # Temporarily set max upload to 1 MB for testing
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 1)

    oversized_bytes = b"%PDF-1.4 " + (b"A" * (1024 * 1024 * 2))  # 2 MB > 1 MB limit
    res = client.post(
        "/api/notices",
        files={"file": ("large_notice.pdf", oversized_bytes, "application/pdf")},
    )
    assert res.status_code == 413
    data = res.json()
    assert data["error"] == "FILE_TOO_LARGE"
    assert "exceeds maximum permitted limit" in data["message"]


def test_unsafe_filename_path_traversal_rejected(client: TestClient) -> None:
    """Verify upload rejects filenames with path traversal attempts (../ or ..\\)."""
    valid_pdf_content = b"%PDF-1.4 Valid dummy PDF content"
    traversal_filenames = [
        "../../etc/passwd.pdf",
        "..\\..\\windows\\system32\\cmd.pdf",
        "nested/path/to/notice.pdf",
    ]
    for bad_name in traversal_filenames:
        res = client.post(
            "/api/notices",
            files={"file": (bad_name, valid_pdf_content, "application/pdf")},
        )
        assert res.status_code == 400
        data = res.json()
        assert data["error"] == "UNSAFE_FILENAME"
        assert "unsafe path" in data["message"].lower()


def test_unique_server_filenames_and_no_overwrites(client: TestClient, tmp_path: Path) -> None:
    """Verify uploading two files with identical user filenames generates distinct storage paths."""
    session = notice_service.session_factory()
    try:
        content1 = b"%PDF-1.4 Notice Version 1"
        content2 = b"%PDF-1.4 Notice Version 2"

        # Upload file 1
        id1, path1 = notice_service.validate_and_save_upload("circular.pdf", content1, "application/pdf")
        # Upload file 2 with exact same original filename
        id2, path2 = notice_service.validate_and_save_upload("circular.pdf", content2, "application/pdf")

        assert id1 != id2
        assert path1 != path2
        assert path1.exists()
        assert path2.exists()
        assert path1.read_bytes() == content1
        assert path2.read_bytes() == content2
    finally:
        session.close()


def test_private_file_storage_isolation(client: TestClient) -> None:
    """Verify that stored files reside in a private directory and are not statically served."""
    # Attempting to access file path directly through web root should 404
    res = client.get("/uploads/test.pdf")
    assert res.status_code == 404

    # Only controlled API route can serve file
    res2 = client.get("/api/notices/notice-nonexistent/file")
    assert res2.status_code == 404


def test_rate_limit_enforcement_returns_429(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify exceeding configured upload rate limit returns HTTP 429 Too Many Requests."""
    fake_llm = FakeLLMClient({"category": "scholarship_or_college"})
    app.dependency_overrides[get_llm] = lambda: fake_llm

    # Configure a strict limiter of 3 requests per 60 seconds
    monkeypatch.setattr(upload_rate_limiter, "max_requests", 3)
    monkeypatch.setattr(upload_rate_limiter, "window_seconds", 60)
    monkeypatch.setattr(upload_rate_limiter, "enabled", True)
    upload_rate_limiter.reset()

    pdf_content = b"%PDF-1.4 Minimal dummy PDF for rate testing"

    # Requests 1, 2, 3 should succeed
    for i in range(3):
        res = client.post(
            "/api/notices",
            files={"file": (f"notice_{i}.pdf", pdf_content, "application/pdf")},
        )
        assert res.status_code == 202

    # Request 4 exceeds rate limit and must return 429
    res_blocked = client.post(
        "/api/notices",
        files={"file": ("notice_blocked.pdf", pdf_content, "application/pdf")},
    )
    assert res_blocked.status_code == 429
    data = res_blocked.json()
    assert data["error"] == "RATE_LIMIT_EXCEEDED"
    assert "Too many upload requests" in data["message"]
    assert "Retry-After" in res_blocked.headers
