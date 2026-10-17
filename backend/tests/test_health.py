from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health_check_returns_200() -> None:
    """Verify /health endpoint returns 200 with expected healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "Notice to Action" in data["app"]


def test_get_sample_notice() -> None:
    """Verify /api/v1/notices/sample returns valid sample payload."""
    response = client.get("/api/v1/notices/sample")
    assert response.status_code == 200
    data = response.json()
    assert "notice_id" in data
    assert "deadlines" in data
    assert "required_documents" in data
    assert "action_steps" in data


def test_upload_rejects_non_pdf() -> None:
    """Verify /api/v1/notices/upload rejects non-PDF files with friendly 400."""
    response = client.post(
        "/api/v1/notices/upload",
        files={"file": ("test.txt", b"plain text content", "text/plain")},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["error_code"] == "INVALID_FILE_TYPE"
