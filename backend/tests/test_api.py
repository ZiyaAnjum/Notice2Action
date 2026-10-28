"""Integration tests for FastAPI backend endpoints."""

import json
from collections.abc import Generator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.database import Base, get_db
from backend.app.dependencies import get_llm
from backend.app.main import app
from backend.app.services.notice_service import notice_service
from extraction.llm_client import FakeLLMClient

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"
SAMPLES_DIR = Path(__file__).resolve().parent.parent.parent / "samples"


def load_sample_scholarship_json() -> dict[str, Any]:
    sample_file = SAMPLES_DIR / "scholarship_renewal_notice.json"
    with open(sample_file, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(autouse=True)
def setup_test_environment(tmp_path: Path) -> Generator[None, None, None]:
    """Provide isolated test SQLite database and upload directory per test function."""
    # 1. Isolated test database
    test_db_path = tmp_path / "test_api.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    # 2. Isolated test upload directory
    test_upload_dir = tmp_path / "uploads"
    test_upload_dir.mkdir(parents=True, exist_ok=True)
    orig_upload_dir = notice_service.upload_dir
    orig_session_factory = notice_service.session_factory
    notice_service.upload_dir = test_upload_dir
    notice_service.session_factory = TestingSessionLocal

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield

    app.dependency_overrides.clear()
    notice_service.upload_dir = orig_upload_dir
    notice_service.session_factory = orig_session_factory
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_api_health_check(client: TestClient) -> None:
    """Verify /api/health and /health return 200 healthy status and DB connectivity."""
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"
    assert res.json()["database"] == "connected"

    res_legacy = client.get("/health")
    assert res_legacy.status_code == 200
    assert res_legacy.json()["status"] == "healthy"
    assert res_legacy.json()["database"] == "connected"


def test_upload_valid_fixture_and_poll(client: TestClient) -> None:
    """Verify uploading a valid PDF fixture processes completely."""
    canned_payload = load_sample_scholarship_json()
    fake_llm = FakeLLMClient(canned_payload)
    app.dependency_overrides[get_llm] = lambda: fake_llm

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    with open(pdf_path, "rb") as f:
        upload_res = client.post(
            "/api/notices",
            files={"file": (pdf_path.name, f.read(), "application/pdf")},
        )

    assert upload_res.status_code == 202
    notice_id = upload_res.json()["id"]
    assert notice_id.startswith("notice-")

    # Poll notice detail
    detail_res = client.get(f"/api/notices/{notice_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()

    assert detail["status"] == "processed"
    assert detail["category"] == "scholarship_or_college"
    assert detail["result"] is not None
    assert len(detail["checklist"]) > 0


def test_upload_validation_errors(client: TestClient) -> None:
    """Verify rejection of non-PDF, wrong magic bytes, empty, and oversized files."""
    # 1. Non-PDF content-type
    res_non_pdf = client.post(
        "/api/notices",
        files={"file": ("readme.txt", b"plain text", "text/plain")},
    )
    assert res_non_pdf.status_code == 400
    assert res_non_pdf.json()["error"] == "INVALID_FILE_TYPE"

    # 2. Empty file
    res_empty = client.post(
        "/api/notices",
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )
    assert res_empty.status_code == 400
    assert res_empty.json()["error"] == "EMPTY_FILE"

    # 3. Invalid magic bytes (spoofed PDF extension and MIME)
    res_magic = client.post(
        "/api/notices",
        files={"file": ("fake.pdf", b"NOTAPDF header line", "application/pdf")},
    )
    assert res_magic.status_code == 422
    assert res_magic.json()["error"] == "INVALID_MAGIC_BYTES"

    # 4. Oversized file (> 25MB)
    huge_payload = b"%PDF-1.4 " + (b"0" * (26 * 1024 * 1024))
    res_huge = client.post(
        "/api/notices",
        files={"file": ("huge.pdf", huge_payload, "application/pdf")},
    )
    assert res_huge.status_code == 413
    assert res_huge.json()["error"] == "FILE_TOO_LARGE"


def test_scanned_and_recipe_refusal_without_llm(client: TestClient) -> None:
    """Verify scanned and out-of-scope files refuse early without calling LLM."""
    fake_llm = FakeLLMClient(["{}"])
    app.dependency_overrides[get_llm] = lambda: fake_llm

    # 1. Scanned / image-only PDF
    scan_path = FIXTURES_DIR / "scanned_image_only.pdf"
    with open(scan_path, "rb") as f:
        res_scan = client.post(
            "/api/notices",
            files={"file": (scan_path.name, f.read(), "application/pdf")},
        )
    assert res_scan.status_code == 202
    scan_id = res_scan.json()["id"]

    scan_detail = client.get(f"/api/notices/{scan_id}").json()
    assert scan_detail["status"] == "needs_clearer_document"
    assert scan_detail["needs_verification"] is True

    # 2. Recipe out-of-scope PDF
    recipe_path = FIXTURES_DIR / "recipe_unrelated.pdf"
    with open(recipe_path, "rb") as f:
        res_recipe = client.post(
            "/api/notices",
            files={"file": (recipe_path.name, f.read(), "application/pdf")},
        )
    assert res_recipe.status_code == 202
    recipe_id = res_recipe.json()["id"]

    recipe_detail = client.get(f"/api/notices/{recipe_id}").json()
    assert recipe_detail["status"] == "out_of_scope"

    # Crucial assertion: LLM was never called for either refusal
    assert fake_llm.call_count == 0


def test_checklist_patch_and_validation(client: TestClient) -> None:
    """Verify updating checklist item status and rejecting invalid status."""
    fake_llm = FakeLLMClient(load_sample_scholarship_json())
    app.dependency_overrides[get_llm] = lambda: fake_llm

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    with open(pdf_path, "rb") as f:
        upload_res = client.post(
            "/api/notices",
            files={"file": (pdf_path.name, f.read(), "application/pdf")},
        )
    notice_id = upload_res.json()["id"]

    # Valid status update
    patch_res = client.patch(
        f"/api/notices/{notice_id}/checklist/Semester%20II%20Official%20Marksheet",
        json={"status": "completed"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "completed"

    # Invalid status rejection
    invalid_patch = client.patch(
        f"/api/notices/{notice_id}/checklist/Semester%20II%20Official%20Marksheet",
        json={"status": "invalid_status_value"},
    )
    assert invalid_patch.status_code == 422


def test_reminder_crud_and_upcoming_filter(client: TestClient) -> None:
    """Verify creating, listing, updating, deleting reminders, and upcoming filter."""
    fake_llm = FakeLLMClient(load_sample_scholarship_json())
    app.dependency_overrides[get_llm] = lambda: fake_llm

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    with open(pdf_path, "rb") as f:
        notice_id = client.post(
            "/api/notices",
            files={"file": (pdf_path.name, f.read(), "application/pdf")},
        ).json()["id"]

    # 1. Create reminder due in 2 days
    due_in_2_days = date.today() + timedelta(days=2)
    create_res = client.post(
        f"/api/notices/{notice_id}/reminders",
        json={
            "deadline_ref": "Final renewal dossier submission",
            "remind_on": due_in_2_days.isoformat(),
            "note": "Verify college countersignature",
        },
    )
    assert create_res.status_code == 201
    rem_id = create_res.json()["id"]
    assert create_res.json()["done"] is False

    # 2. List reminders for notice
    list_res = client.get(f"/api/notices/{notice_id}/reminders")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 3. Upcoming filter
    upcoming_res = client.get("/api/reminders/upcoming?days=7")
    assert upcoming_res.status_code == 200
    upcoming = upcoming_res.json()
    assert any(r["id"] == rem_id for r in upcoming)

    # 4. Patch reminder to done
    patch_rem = client.patch(f"/api/reminders/{rem_id}", json={"done": True})
    assert patch_rem.status_code == 200
    assert patch_rem.json()["done"] is True

    # 5. Verify no longer in upcoming
    upcoming_after = client.get("/api/reminders/upcoming?days=7").json()
    assert not any(r["id"] == rem_id for r in upcoming_after)

    # 6. Delete reminder
    del_res = client.delete(f"/api/reminders/{rem_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"


def test_page_text_and_missing_page_404(client: TestClient) -> None:
    """Verify page text retrieval and 404 for out-of-range page."""
    fake_llm = FakeLLMClient(load_sample_scholarship_json())
    app.dependency_overrides[get_llm] = lambda: fake_llm

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    with open(pdf_path, "rb") as f:
        notice_id = client.post(
            "/api/notices",
            files={"file": (pdf_path.name, f.read(), "application/pdf")},
        ).json()["id"]

    # Valid page 1
    page1_res = client.get(f"/api/notices/{notice_id}/pages/1")
    assert page1_res.status_code == 200
    assert page1_res.json()["page_number"] == 1
    assert "Post-Graduate Merit Scholarship" in page1_res.json()["text"]

    # Out-of-bounds page 99
    page99_res = client.get(f"/api/notices/{notice_id}/pages/99")
    assert page99_res.status_code == 404
    assert page99_res.json()["error"] == "PAGE_NOT_FOUND"


def test_delete_notice_removes_db_and_disk_file(client: TestClient) -> None:
    """Verify DELETE /api/notices/{id} removes database rows and local physical file."""
    fake_llm = FakeLLMClient(load_sample_scholarship_json())
    app.dependency_overrides[get_llm] = lambda: fake_llm

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    with open(pdf_path, "rb") as f:
        notice_id = client.post(
            "/api/notices",
            files={"file": (pdf_path.name, f.read(), "application/pdf")},
        ).json()["id"]

    # Get file download to verify it exists
    file_res = client.get(f"/api/notices/{notice_id}/file")
    assert file_res.status_code == 200
    assert file_res.headers["content-type"] == "application/pdf"

    # Delete notice
    del_res = client.delete(f"/api/notices/{notice_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify 404 on subsequent detail call
    assert client.get(f"/api/notices/{notice_id}").status_code == 404
    assert client.get(f"/api/notices/{notice_id}/file").status_code == 404


def test_isolated_access_cross_notice_404(client: TestClient) -> None:
    """Verify non-existent notice IDs return 404 across detail, pages, and file endpoints."""
    non_existent = "notice-nonexistent-0000"
    assert client.get(f"/api/notices/{non_existent}").status_code == 404
    assert client.get(f"/api/notices/{non_existent}/pages/1").status_code == 404
    assert client.get(f"/api/notices/{non_existent}/file").status_code == 404


def test_missing_api_key_graceful_status(client: TestClient) -> None:
    """Verify upload succeeds and ends with clear message when AI API key is unconfigured."""
    from extraction.llm_client import GeminiLLMClient

    # Unconfigured client with empty key
    unconfigured_llm = GeminiLLMClient(api_key="")
    app.dependency_overrides[get_llm] = lambda: unconfigured_llm

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    with open(pdf_path, "rb") as f:
        upload_res = client.post(
            "/api/notices",
            files={"file": (pdf_path.name, f.read(), "application/pdf")},
        )

    # Must return 202, NOT 500
    assert upload_res.status_code == 202
    notice_id = upload_res.json()["id"]

    # Poll status: ends in extraction_failed with clear message, not crashed
    detail = client.get(f"/api/notices/{notice_id}").json()
    assert detail["status"] == "extraction_failed"
    assert "AI extraction service is not configured" in detail["message"]


def test_storage_interface_crud_and_backends(tmp_path: Path) -> None:
    """Verify FileStorage save, read, delete, and backend factory selection."""
    from backend.app.storage import LocalFileStorage, SupabaseFileStorage, get_storage

    # 1. LocalFileStorage CRUD
    store = LocalFileStorage(upload_dir=tmp_path / "custom_storage")
    content = b"%PDF-1.5 test notice content"
    stored_path = store.save("original.pdf", content)

    # Must be in custom directory with UUID name, not user filename
    assert "original.pdf" not in stored_path
    assert Path(stored_path).exists()

    # Read back
    assert store.read(stored_path) == content
    assert store.get_local_path(stored_path) == Path(stored_path)

    # Delete
    assert store.delete(stored_path) is True
    assert not Path(stored_path).exists()
    # Idempotent delete
    assert store.delete(stored_path) is True

    # 2. Factory selection
    local_inst = get_storage(backend="local", upload_dir=tmp_path)
    assert isinstance(local_inst, LocalFileStorage)

    supabase_inst = get_storage(backend="supabase")
    assert isinstance(supabase_inst, SupabaseFileStorage)

    # Supabase stub raises NotImplementedError
    with pytest.raises(NotImplementedError):
        supabase_inst.save("test.pdf", b"data")

    # Invalid backend raises ValueError
    with pytest.raises(ValueError):
        get_storage(backend="invalid_backend_name")
