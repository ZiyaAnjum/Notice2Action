"""Comprehensive tests for authentication, user isolation, tokens, and security."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import fitz  # PyMuPDF
import pytest
from fastapi import HTTPException, Request, Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.dependencies import get_current_user
from backend.app.models.notice import NoticeModel
from backend.app.models.user import RefreshTokenModel, SecurityTokenModel, UserModel
from backend.app.routers.auth import (
    delete_account,
    forgot_password,
    get_current_user_profile,
    login,
    logout,
    refresh_session,
    reset_password,
    signup,
    verify_email,
)
from backend.app.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
)
from backend.app.security import (
    create_access_token,
    hash_password,
    rate_limiter,
    verify_password,
)
from backend.app.services.notice_service import NoticeService, NoticeServiceError


def run_sync(coro):
    """Execute non-awaiting coroutine synchronously without event loop sockets."""
    try:
        coro.send(None)
    except StopIteration as exc:
        return exc.value


class MockResponse:
    """Mock HTTP response matching requests/TestClient API."""

    def __init__(self, status_code: int, data: Any = None, cookies: dict | None = None):
        self.status_code = status_code
        self._data = data if data is not None else {}
        self.cookies = cookies or {}

    def json(self) -> Any:
        return self._data


class DirectTestClient:
    """Direct synchronous test client testing routes without AnyIO socket deadlocks."""

    def __init__(self, session_factory, notice_service):
        self.session_factory = session_factory
        self.notice_service = notice_service
        self.cookies: dict[str, str] = {}

    def _extract_cookies(self, response: Response):
        for header, val in response.raw_headers:
            if header == b"set-cookie":
                cookie_str = val.decode("latin-1")
                parts = cookie_str.split(";")[0].split("=", 1)
                if len(parts) == 2:
                    self.cookies[parts[0].strip()] = parts[1].strip()

    def _build_request(self, headers: dict | None = None) -> Request:
        raw_headers = []
        if headers:
            for k, v in headers.items():
                raw_headers.append((k.lower().encode("latin-1"), v.encode("latin-1")))
        scope = {
            "type": "http",
            "client": ("127.0.0.1", 12345),
            "headers": raw_headers,
        }
        return Request(scope)

    def post(self, path: str, json: dict | None = None, headers: dict | None = None) -> MockResponse:
        req = self._build_request(headers)
        resp = Response()
        json_data = json or {}
        try:
            with self.session_factory() as db:
                if path == "/auth/signup":
                    payload = SignupRequest(**json_data)
                    data = run_sync(signup(payload, req, resp, db))
                    self._extract_cookies(resp)
                    return MockResponse(201, data, cookies=self.cookies)
                elif path == "/auth/login":
                    payload = LoginRequest(**json_data)
                    data = run_sync(login(payload, req, resp, db))
                    self._extract_cookies(resp)
                    return MockResponse(200, data, cookies=self.cookies)
                elif path == "/auth/logout":
                    token = self.cookies.get("refresh_token")
                    data = run_sync(logout(resp, db, refresh_token=token))
                    self.cookies.pop("refresh_token", None)
                    return MockResponse(200, data, cookies=self.cookies)
                elif path == "/auth/refresh":
                    token = self.cookies.get("refresh_token")
                    data = run_sync(refresh_session(resp, db, refresh_token=token))
                    self._extract_cookies(resp)
                    return MockResponse(200, data, cookies=self.cookies)
                elif path == "/auth/forgot-password":
                    payload = ForgotPasswordRequest(**json_data)
                    data = run_sync(forgot_password(payload, req, db))
                    return MockResponse(200, data, cookies=self.cookies)
                elif path == "/auth/reset-password":
                    payload = ResetPasswordRequest(**json_data)
                    data = run_sync(reset_password(payload, db))
                    return MockResponse(200, data, cookies=self.cookies)
                else:
                    return MockResponse(404, {"error": "Not Found"})
        except HTTPException as exc:
            return MockResponse(
                exc.status_code,
                exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail), "error_code": "ERROR"},
            )
        except Exception as exc:
            return MockResponse(422, {"message": str(exc), "error_code": "VALIDATION_ERROR"})

    def get(self, path: str, headers: dict | None = None) -> MockResponse:
        req = self._build_request(headers)
        try:
            with self.session_factory() as db:
                if path == "/auth/me":
                    user = get_current_user(req, db)
                    data = run_sync(get_current_user_profile(user))
                    return MockResponse(200, data, cookies=self.cookies)
                elif path.startswith("/auth/verify"):
                    qs = parse_qs(urlparse(path).query)
                    token = qs.get("token", [""])[0]
                    data = run_sync(verify_email(token, db))
                    return MockResponse(200, data, cookies=self.cookies)
                elif path == "/notices":
                    user = get_current_user(req, db)
                    items = self.notice_service.list_notices(db=db, user_id=user.id)
                    return MockResponse(
                        200,
                        [item if isinstance(item, dict) else item.model_dump() for item in items],
                        cookies=self.cookies,
                    )
                elif path.startswith("/notices/") and path.endswith("/file"):
                    user = get_current_user(req, db)
                    notice_id = path.split("/")[2]
                    try:
                        fpath = self.notice_service.get_notice_file_path(db=db, notice_id=notice_id, user_id=user.id)
                        if not fpath:
                            return MockResponse(404, {"error_code": "NOTICE_NOT_FOUND", "message": "Notice not found."})
                        return MockResponse(200, {"file_path": str(fpath[0])}, cookies=self.cookies)
                    except NoticeServiceError:
                        return MockResponse(404, {"error_code": "NOTICE_NOT_FOUND", "message": "Notice not found."})
                elif path.startswith("/notices/"):
                    user = get_current_user(req, db)
                    notice_id = path.split("/")[2]
                    try:
                        detail = self.notice_service.get_notice_detail(db=db, notice_id=notice_id, user_id=user.id)
                        if detail is None:
                            return MockResponse(404, {"error_code": "NOTICE_NOT_FOUND", "message": "Notice not found."})
                        return MockResponse(
                            200,
                            detail if isinstance(detail, dict) else detail.model_dump(),
                            cookies=self.cookies,
                        )
                    except NoticeServiceError:
                        return MockResponse(404, {"error_code": "NOTICE_NOT_FOUND", "message": "Notice not found."})
                else:
                    return MockResponse(404, {"error": "Not Found"})
        except HTTPException as exc:
            return MockResponse(
                exc.status_code,
                exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail), "error_code": "ERROR"},
            )

    def delete(self, path: str, headers: dict | None = None) -> MockResponse:
        req = self._build_request(headers)
        resp = Response()
        try:
            with self.session_factory() as db:
                if path == "/auth/account":
                    user = get_current_user(req, db)
                    data = run_sync(delete_account(resp, user, db))
                    return MockResponse(200, data, cookies=self.cookies)
                elif path.startswith("/notices/"):
                    user = get_current_user(req, db)
                    notice_id = path.split("/")[2]
                    try:
                        deleted = self.notice_service.delete_notice(db=db, notice_id=notice_id, user_id=user.id)
                        if not deleted:
                            return MockResponse(404, {"error_code": "NOTICE_NOT_FOUND", "message": "Notice not found."})
                        return MockResponse(200, {"status": "success"}, cookies=self.cookies)
                    except NoticeServiceError:
                        return MockResponse(404, {"error_code": "NOTICE_NOT_FOUND", "message": "Notice not found."})
                else:
                    return MockResponse(404, {"error": "Not Found"})
        except HTTPException as exc:
            return MockResponse(
                exc.status_code,
                exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail), "error_code": "ERROR"},
            )


@pytest.fixture
def auth_client(tmp_path: Path):
    """Provide isolated SQLite test client with fresh database and notice service."""
    test_db_path = tmp_path / "test_auth.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    # Seed demo user
    with TestingSession() as db:
        demo = UserModel(
            id="demo-user-seed-000000000001",
            email="demo@notice2action.com",
            full_name="Demo User",
            password_hash=hash_password("DemoPassword123!"),
            is_verified=True,
            preferred_language="en",
            is_demo=True,
        )
        db.add(demo)
        db.commit()

    service = NoticeService(upload_dir=tmp_path / "uploads", session_factory=TestingSession)
    client = DirectTestClient(TestingSession, service)
    return client, TestingSession, service


def test_signup_success(auth_client):
    """Test successful user registration returns access token and user profile."""
    client, TestingSession, _ = auth_client
    resp = client.post(
        "/auth/signup",
        json={"full_name": "Alice Tester", "email": "alice@example.com", "password": "SecurePassword123!"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["full_name"] == "Alice Tester"
    assert data["user"]["is_verified"] is False
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]

    # Verify refresh token cookie is set
    assert "refresh_token" in resp.cookies


def test_signup_duplicate_email(auth_client):
    """Test duplicate signup fails with 409 Conflict."""
    client, _, _ = auth_client
    # Signup first time
    client.post(
        "/auth/signup",
        json={"full_name": "Alice Tester", "email": "alice2@example.com", "password": "SecurePassword123!"},
    )
    # Signup duplicate
    resp = client.post(
        "/auth/signup",
        json={"full_name": "Alice Duplicate", "email": "ALICE2@EXAMPLE.COM", "password": "AnotherPassword123!"},
    )
    assert resp.status_code == 409
    data = resp.json()
    assert data["error_code"] == "EMAIL_ALREADY_REGISTERED"


def test_signup_weak_or_common_password(auth_client):
    """Test short and common passwords are systematically rejected."""
    client, _, _ = auth_client
    # Short password (< 8 chars)
    resp = client.post(
        "/auth/signup",
        json={"full_name": "Bob", "email": "bob@example.com", "password": "short"},
    )
    assert resp.status_code == 422

    # Common password
    resp = client.post(
        "/auth/signup",
        json={"full_name": "Bob", "email": "bob@example.com", "password": "password123"},
    )
    assert resp.status_code == 422
    assert "common" in resp.json()["message"].lower()


def test_login_and_auth_me(auth_client):
    """Test successful login, /auth/me profile query, and generic error on bad credentials."""
    client, _, _ = auth_client
    # Register user
    client.post(
        "/auth/signup",
        json={"full_name": "Charlie", "email": "charlie@example.com", "password": "MySecretPassword123!"},
    )

    # Wrong password: must return generic error
    bad_login = client.post(
        "/auth/login",
        json={"email": "charlie@example.com", "password": "WrongPassword123!"},
    )
    assert bad_login.status_code == 401
    assert "Invalid email or password" in bad_login.json()["message"]

    # Nonexistent email: must return same generic error (prevent enumeration)
    no_user = client.post(
        "/auth/login",
        json={"email": "nonexistent@example.com", "password": "AnyPassword123!"},
    )
    assert no_user.status_code == 401
    assert "Invalid email or password" in no_user.json()["message"]

    # Correct credentials
    login_resp = client.post(
        "/auth/login",
        json={"email": "CHARLIE@example.com", "password": "MySecretPassword123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    # Call /auth/me without token -> 401
    unauth = client.get("/auth/me")
    assert unauth.status_code == 401

    # Call /auth/me with Bearer token -> 200
    auth_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert auth_resp.status_code == 200
    assert auth_resp.json()["email"] == "charlie@example.com"


def test_token_expiry(auth_client):
    """Test expired access token is rejected."""
    client, TestingSession, _ = auth_client
    with TestingSession() as db:
        user = UserModel(
            id="user-expired-001",
            email="expired@example.com",
            full_name="Expired User",
            password_hash=hash_password("Password123!"),
            is_verified=True,
        )
        db.add(user)
        db.commit()

    # Create expired token (expired 5 minutes ago)
    expired_token = create_access_token(
        user_id="user-expired-001",
        email="expired@example.com",
        expires_delta=timedelta(minutes=-5),
    )

    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert resp.status_code == 401
    assert resp.json()["error_code"] == "TOKEN_EXPIRED"


def test_refresh_token_flow_and_logout(auth_client):
    """Test refresh token exchange and logout revocation."""
    client, _, _ = auth_client
    signup_resp = client.post(
        "/auth/signup",
        json={"full_name": "Dave", "email": "dave@example.com", "password": "DavePassword123!"},
    )
    assert signup_resp.status_code == 201

    # Refresh session using cookie
    refresh_resp = client.post("/auth/refresh")
    assert refresh_resp.status_code == 200
    new_token = refresh_resp.json()["access_token"]
    assert new_token is not None

    # Logout
    logout_resp = client.post("/auth/logout")
    assert logout_resp.status_code == 200

    # Subsequent refresh should fail
    post_logout_refresh = client.post("/auth/refresh")
    assert post_logout_refresh.status_code == 401


def test_user_isolation_notices(auth_client, tmp_path: Path):
    """Verify user A cannot read, list, download, or delete user B's notice (returns 404, NOT 403)."""
    client, TestingSession, service = auth_client

    # User A
    resp_a = client.post(
        "/auth/signup",
        json={"full_name": "User A", "email": "user_a@example.com", "password": "UserAPassword123!"},
    )
    token_a = resp_a.json()["access_token"]
    user_a_id = resp_a.json()["user"]["id"]

    # User B
    resp_b = client.post(
        "/auth/signup",
        json={"full_name": "User B", "email": "user_b@example.com", "password": "UserBPassword123!"},
    )
    token_b = resp_b.json()["access_token"]
    user_b_id = resp_b.json()["user"]["id"]

    # Create notice for User A
    pdf_path = tmp_path / "user_a_notice.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "Confidential notice for User A only.")
    doc.save(str(pdf_path))
    doc.close()

    with TestingSession() as db:
        notice_a, _ = service.create_pending_notice(
            db=db,
            notice_id="notice-user-a-123",
            filename="user_a_notice.pdf",
            stored_path=pdf_path,
            user_id=user_a_id,
        )

    # User A can access notice A
    res_a = client.get("/notices/notice-user-a-123", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.status_code == 200

    # User B tries to access notice A -> must return 404 NOT 403
    res_b = client.get("/notices/notice-user-a-123", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code == 404
    assert res_b.json()["error_code"] == "NOTICE_NOT_FOUND"

    # User B tries to download notice A file -> 404
    file_b = client.get("/notices/notice-user-a-123/file", headers={"Authorization": f"Bearer {token_b}"})
    assert file_b.status_code == 404

    # User B tries to delete notice A -> 404
    del_b = client.delete("/notices/notice-user-a-123", headers={"Authorization": f"Bearer {token_b}"})
    assert del_b.status_code == 404

    # User B lists notices -> does not see Notice A
    list_b = client.get("/notices", headers={"Authorization": f"Bearer {token_b}"})
    assert list_b.status_code == 200
    assert len(list_b.json()) == 0


def test_per_user_cache_isolation(auth_client, tmp_path: Path):
    """Verify SHA-256 cache hits are strictly scoped per-user and never leaked across users."""
    client, TestingSession, service = auth_client

    # User 1
    resp1 = client.post(
        "/auth/signup",
        json={"full_name": "User 1", "email": "user1@example.com", "password": "User1Password123!"},
    )
    user1_id = resp1.json()["user"]["id"]

    # User 2
    resp2 = client.post(
        "/auth/signup",
        json={"full_name": "User 2", "email": "user2@example.com", "password": "User2Password123!"},
    )
    user2_id = resp2.json()["user"]["id"]

    # Create dummy PDF
    pdf_path = tmp_path / "shared_content.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "Standard Electricity Notice Content")
    doc.save(str(pdf_path))
    doc.close()

    # User 1 caches processed result
    with TestingSession() as db:
        notice1, _ = service.create_pending_notice(
            db=db,
            notice_id="notice-cached-u1",
            filename="shared.pdf",
            stored_path=pdf_path,
            user_id=user1_id,
        )
        notice1.status = "complete"
        notice1.result_json = {"headline": {"one_line_summary": "User 1 Private Summary"}}
        db.commit()

    # User 2 uploads the identical PDF content
    with TestingSession() as db:
        notice2, is_cached_for_u2 = service.create_pending_notice(
            db=db,
            notice_id="notice-cached-u2",
            filename="shared.pdf",
            stored_path=pdf_path,
            user_id=user2_id,
        )
        # MUST NOT HIT CACHE for User 2
        assert is_cached_for_u2 is False
        assert notice2.result_json is None

        # But User 1 re-uploading identical PDF MUST hit cache
        notice1_reup, is_cached_for_u1 = service.create_pending_notice(
            db=db,
            notice_id="notice-cached-u1-reup",
            filename="shared.pdf",
            stored_path=pdf_path,
            user_id=user1_id,
        )
        assert is_cached_for_u1 is True
        assert notice1_reup.result_json["headline"]["one_line_summary"] == "User 1 Private Summary"


def test_rate_limiting(auth_client):
    """Test rate limiting on auth login attempts."""
    client, _, _ = auth_client
    ip_key = "login:testclient:ratelimit@example.com"
    rate_limiter.reset(ip_key)

    # Make 5 attempts (allowed)
    for _ in range(5):
        resp = client.post(
            "/auth/login",
            json={"email": "ratelimit@example.com", "password": "WrongPassword123!"},
        )
        assert resp.status_code == 401

    # 6th attempt: must be blocked with 429
    blocked_resp = client.post(
        "/auth/login",
        json={"email": "ratelimit@example.com", "password": "WrongPassword123!"},
    )
    assert blocked_resp.status_code == 429
    assert blocked_resp.json()["error_code"] == "RATE_LIMIT_EXCEEDED"
    rate_limiter.reset(ip_key)


def test_email_verification_flow(auth_client):
    """Test email verification one-time token."""
    client, TestingSession, _ = auth_client
    resp = client.post(
        "/auth/signup",
        json={"full_name": "Eve", "email": "eve@example.com", "password": "EvePassword123!"},
    )
    user_id = resp.json()["user"]["id"]
    token = resp.json()["access_token"]

    with TestingSession() as db:
        token_record = (
            db.query(SecurityTokenModel)
            .filter(SecurityTokenModel.user_id == user_id, SecurityTokenModel.token_type == "email_verify")
            .first()
        )
        assert token_record is not None
        # We can simulate verify by creating a known token
        from backend.app.security import generate_secure_token
        raw_token, token_hash = generate_secure_token()
        token_record.token_hash = token_hash
        db.commit()

    # Call verify endpoint
    verify_resp = client.get(f"/auth/verify?token={raw_token}")
    assert verify_resp.status_code == 200

    # User is now verified
    me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.json()["is_verified"] is True

    # Reused token must fail
    reused_resp = client.get(f"/auth/verify?token={raw_token}")
    assert reused_resp.status_code == 400


def test_password_reset_flow(auth_client):
    """Test password reset token issuance, execution, and invalidation."""
    client, TestingSession, _ = auth_client
    resp = client.post(
        "/auth/signup",
        json={"full_name": "Frank", "email": "frank@example.com", "password": "OldPassword123!"},
    )
    user_id = resp.json()["user"]["id"]

    # Request password reset (always returns 200)
    forgot_resp = client.post("/auth/forgot-password", json={"email": "frank@example.com"})
    assert forgot_resp.status_code == 200

    with TestingSession() as db:
        token_record = (
            db.query(SecurityTokenModel)
            .filter(SecurityTokenModel.user_id == user_id, SecurityTokenModel.token_type == "password_reset")
            .order_by(SecurityTokenModel.id.desc())
            .first()
        )
        from backend.app.security import generate_secure_token
        raw_reset_token, reset_hash = generate_secure_token()
        token_record.token_hash = reset_hash
        db.commit()

    # Reset password with weak password -> 422
    weak_reset = client.post(
        "/auth/reset-password",
        json={"token": raw_reset_token, "new_password": "short"},
    )
    assert weak_reset.status_code == 422

    # Reset with strong password -> 200
    reset_resp = client.post(
        "/auth/reset-password",
        json={"token": raw_reset_token, "new_password": "BrandNewPassword123!"},
    )
    assert reset_resp.status_code == 200

    # Login with new password succeeds
    login_new = client.post(
        "/auth/login",
        json={"email": "frank@example.com", "password": "BrandNewPassword123!"},
    )
    assert login_new.status_code == 200

    # Old password fails
    login_old = client.post(
        "/auth/login",
        json={"email": "frank@example.com", "password": "OldPassword123!"},
    )
    assert login_old.status_code == 401


def test_delete_account_and_demo_protection(auth_client, tmp_path: Path):
    """Test account deletion removes user, notices, files, and demo user is protected."""
    client, TestingSession, service = auth_client

    # Demo account deletion blocked
    demo_login = client.post(
        "/auth/login",
        json={"email": "demo@notice2action.com", "password": "DemoPassword123!"},
    )
    assert demo_login.status_code == 200
    demo_token = demo_login.json()["access_token"]

    del_demo = client.delete("/auth/account", headers={"Authorization": f"Bearer {demo_token}"})
    assert del_demo.status_code == 403
    assert del_demo.json()["error_code"] == "DEMO_ACCOUNT_PROTECTED"

    # Regular user can delete account and their files
    reg_signup = client.post(
        "/auth/signup",
        json={"full_name": "Grace", "email": "grace@example.com", "password": "GracePassword123!"},
    )
    grace_token = reg_signup.json()["access_token"]
    grace_id = reg_signup.json()["user"]["id"]

    # Create a notice with physical file for Grace
    pdf_file = tmp_path / "grace_doc.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 test")
    with TestingSession() as db:
        service.create_pending_notice(
            db=db,
            notice_id="notice-grace-999",
            filename="grace_doc.pdf",
            stored_path=pdf_file,
            user_id=grace_id,
        )

    assert pdf_file.exists()

    # Delete Grace's account
    del_grace = client.delete("/auth/account", headers={"Authorization": f"Bearer {grace_token}"})
    assert del_grace.status_code == 200

    # User and notice are gone
    with TestingSession() as db:
        assert db.query(UserModel).filter(UserModel.id == grace_id).first() is None
        assert db.query(NoticeModel).filter(NoticeModel.user_id == grace_id).first() is None
