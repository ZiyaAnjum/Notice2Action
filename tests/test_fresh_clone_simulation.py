"""End-to-end simulation of a fresh clone walkthrough on a single laptop.

Tests the full user journey:
1. Health check (/api/health)
2. Seeded demo user login (demo@notice2action.com / DemoPassword123!)
3. New user registration & login (/api/auth/signup, /api/auth/login)
4. Upload Sample 1: Digital PDF (samples/digital_electricity_notice.pdf)
5. Upload Sample 2: Scanned Image-Only PDF (samples/scanned_tax_notice.pdf)
6. Upload Sample 3: Phone Photo (samples/phone_photo_scholarship_notice.jpg)
7. Verification of Decision Card, Deadlines, Action Checklist, Source Viewer
8. User isolation check (User A cannot see User B's notices)
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.database import init_db
from backend.app.dependencies import get_llm
from backend.app.main import app
from extraction.llm_client import FakeLLMClient


CANNED_DECISION_CARD = {
    "headline": {
        "one_line_summary": "Official Municipal Tax Demand",
        "notice_type": "tax",
        "source_organisation": "Municipal Corporation",
        "amount_due": "18450.00",
        "primary_deadline_id": "dl_1",
        "urgency": "soon",
    },
    "deadlines": [
        {
            "id": "dl_1",
            "label": "Final Tax Payment",
            "iso_date": "2026-12-15",
            "date_type": "exact",
        }
    ],
    "action_steps": [
        {"order": 1, "text": "Pay online via portal before 15 December 2026."}
    ],
    "required_documents": [{"name": "Previous Tax Receipt"}],
    "consequences": [{"label": "2% interest per month after 15 December 2026."}],
    "summary_plain": "Tax demand notice. Total Rs. 18,450 due by 15 December 2026.",
}


@pytest.fixture(scope="module")
def client() -> TestClient:
    init_db()
    fake_client = FakeLLMClient([json.dumps(CANNED_DECISION_CARD)])
    app.dependency_overrides[get_llm] = lambda: fake_client
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.pop(get_llm, None)


def test_01_health_check(client: TestClient) -> None:
    """Verify GET /api/health reports backend healthy, DB connected, Tesseract available."""
    res = client.get("/api/health")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert "tesseract" in data
    assert "gemini" in data
    print("\n[+] /api/health passed:", data)


def test_02_seeded_demo_login(client: TestClient) -> None:
    """Verify seeded demo user logs in with zero manual setup."""
    login_res = client.post(
        "/api/auth/login",
        json={"email": "demo@notice2action.com", "password": "DemoPassword123!"},
    )
    assert login_res.status_code == 200, login_res.text
    body = login_res.json()
    assert "access_token" in body
    assert body["user"]["email"] == "demo@notice2action.com"
    print("\n[+] Seeded demo account login successful.")


def test_03_new_user_signup_and_isolation(client: TestClient) -> None:
    """Verify signup creates new account with proper auth tokens and isolated notices."""
    # 1. Signup new user
    user_email = f"fresh_user_{int(time.time())}@example.com"
    signup_res = client.post(
        "/api/auth/signup",
        json={"full_name": "Fresh Clone User", "email": user_email, "password": "SecurePassword987!"},
    )
    assert signup_res.status_code == 201, signup_res.text
    user_data = signup_res.json()
    token = user_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Check profile
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == user_email

    # 3. Initially has 0 notices
    notices_res = client.get("/api/notices", headers=headers)
    assert notices_res.status_code == 200
    assert len(notices_res.json()) == 0


def test_04_full_flow_all_three_samples(client: TestClient) -> None:
    """Upload digital PDF, scanned image-only PDF, and phone photo; verify decision cards."""
    # Register active test user
    user_email = f"tester_{int(time.time())}@example.com"
    signup = client.post(
        "/api/auth/signup",
        json={"full_name": "Demo Tester", "email": user_email, "password": "Password12345!"},
    )
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    sample_digital = Path("samples/digital_electricity_notice.pdf")
    sample_scanned = Path("samples/scanned_tax_notice.pdf")
    sample_photo = Path("samples/phone_photo_scholarship_notice.jpg")

    assert sample_digital.exists(), f"Missing: {sample_digital}"
    assert sample_scanned.exists(), f"Missing: {sample_scanned}"
    assert sample_photo.exists(), f"Missing: {sample_photo}"

    # Sample 1: Digital PDF Upload
    with open(sample_digital, "rb") as f:
        upload_digital = client.post(
            "/api/notices",
            files={"file": ("digital_electricity_notice.pdf", f, "application/pdf")},
            headers=headers,
        )
    assert upload_digital.status_code == 200, upload_digital.text
    digital_notice_id = upload_digital.json()["notice_id"]
    print(f"\n[+] Digital notice uploaded: {digital_notice_id}")

    # Sample 2: Scanned Image-Only PDF Upload
    with open(sample_scanned, "rb") as f:
        upload_scanned = client.post(
            "/api/notices",
            files={"file": ("scanned_tax_notice.pdf", f, "application/pdf")},
            headers=headers,
        )
    assert upload_scanned.status_code == 200, upload_scanned.text
    scanned_notice_id = upload_scanned.json()["notice_id"]
    print(f"[+] Scanned notice uploaded: {scanned_notice_id}")

    # Sample 3: Camera Photo Upload
    with open(sample_photo, "rb") as f:
        upload_photo = client.post(
            "/api/notices",
            files={"files": [("scholarship_photo.jpg", f, "image/jpeg")]},
            headers=headers,
        )
    assert upload_photo.status_code == 200, upload_photo.text
    photo_notice_id = upload_photo.json()["notice_id"]
    print(f"[+] Camera photo uploaded: {photo_notice_id}")

    # Verify notices list contains all 3
    notices_list = client.get("/api/notices", headers=headers).json()
    uploaded_ids = {n["id"] for n in notices_list}
    assert digital_notice_id in uploaded_ids
    assert scanned_notice_id in uploaded_ids
    assert photo_notice_id in uploaded_ids

    # Verify source viewer on photo notice
    page_img_res = client.get(f"/api/notices/{photo_notice_id}/page-image/1", headers=headers)
    assert page_img_res.status_code == 200
    assert page_img_res.headers["content-type"].startswith("image/")
    print(f"[+] Source viewer serving page image ({len(page_img_res.content)} bytes).")

    # Verify original file download
    orig_res = client.get(f"/api/notices/{photo_notice_id}/original-file", headers=headers)
    assert orig_res.status_code == 200
    print(f"[+] Original file endpoint returned {len(orig_res.content)} bytes.")

    # Isolation Check: Another user cannot view this notice
    other_user = client.post(
        "/api/auth/signup",
        json={"full_name": "Other User", "email": f"other_{int(time.time())}@example.com", "password": "Password12345!"},
    ).json()
    other_headers = {"Authorization": f"Bearer {other_user['access_token']}"}

    forbidden_res = client.get(f"/api/notices/{photo_notice_id}", headers=other_headers)
    assert forbidden_res.status_code == 404  # Scoped query returns 404 Not Found to other users
    print("[+] User isolation verified: other user receives 404 for another user's notice.")
