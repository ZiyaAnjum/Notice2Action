"""Authentication router implementing signup, login, session refresh, and profile management."""

import hashlib
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.database import get_db
from backend.app.dependencies import get_current_user
from backend.app.models.notice import NoticeModel
from backend.app.models.user import RefreshTokenModel, SecurityTokenModel, UserModel
from backend.app.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
    SuccessMessageResponse,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
)
from backend.app.security import (
    create_access_token,
    generate_secure_token,
    hash_password,
    hash_token,
    rate_limiter,
    validate_password_strength,
    verify_password,
)
from backend.app.services.email_service import get_email_sender

settings = get_settings()
router = APIRouter()
email_sender = get_email_sender()

REFRESH_COOKIE_NAME = "refresh_token"


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Set hardened HTTP-only refresh cookie."""
    max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        max_age=max_age,
        expires=max_age,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Clear refresh token cookie on logout/revocation."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/",
        secure=settings.COOKIE_SECURE,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,
    )


def _get_client_ip(request: Request) -> str:
    """Extract client IP handling reverse proxies."""
    try:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and getattr(request.client, "host", None):
            return request.client.host
    except Exception:
        pass
    return "127.0.0.1"


def _create_and_store_refresh_token(db: Session, user_id: str) -> str:
    """Create a new refresh token, hash it for DB storage, and return raw token."""
    raw_token, token_hash = generate_secure_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    token_record = RefreshTokenModel(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        revoked=False,
    )
    db.add(token_record)
    db.commit()
    return raw_token


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Register new user, return initial access token, and set HTTP-only refresh cookie."""
    client_ip = _get_client_ip(request)
    email_clean = payload.email.lower().strip()
    rate_key = f"signup:{client_ip}:{email_clean}"

    if not rate_limiter.is_allowed(rate_key, max_attempts=5, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "RATE_LIMIT_EXCEEDED",
                "error_code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many signup attempts. Please wait a minute before trying again.",
            },
        )

    # Basic email format check
    if not re.match(r"^[^@]+@[^@]+\.[^@]+$", email_clean):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "INVALID_EMAIL",
                "error_code": "INVALID_EMAIL",
                "message": "Please enter a valid email address.",
            },
        )

    # Password strength check
    is_valid_pw, pw_error = validate_password_strength(payload.password)
    if not is_valid_pw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "WEAK_PASSWORD",
                "error_code": "WEAK_PASSWORD",
                "message": pw_error or "Password does not meet security requirements.",
            },
        )

    # Check for duplicate email
    existing_user = db.query(UserModel).filter(UserModel.email == email_clean).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "EMAIL_ALREADY_REGISTERED",
                "error_code": "EMAIL_ALREADY_REGISTERED",
                "message": "An account with this email address already exists. Please sign in instead.",
            },
        )

    # Create user
    pw_hash = hash_password(payload.password)
    new_user = UserModel(
        email=email_clean,
        full_name=payload.full_name.strip(),
        password_hash=pw_hash,
        is_verified=False,
        preferred_language="en",
        is_demo=False,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Generate 24h verification token and send email
    raw_verify_token, verify_token_hash = generate_secure_token()
    verify_record = SecurityTokenModel(
        user_id=new_user.id,
        token_hash=verify_token_hash,
        token_type="email_verify",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(verify_record)
    db.commit()

    email_sender.send_verification_email(new_user.email, raw_verify_token, new_user.full_name)

    # Issue access token and refresh cookie
    access_token = create_access_token(new_user.id, new_user.email)
    raw_refresh_token = _create_and_store_refresh_token(db, new_user.id)
    _set_refresh_cookie(response, raw_refresh_token)

    rate_limiter.reset(rate_key)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": new_user.to_dict(),
    }


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Authenticate user with email and password, returning access token and refresh cookie."""
    client_ip = _get_client_ip(request)
    email_clean = payload.email.lower().strip()
    rate_key = f"login:{client_ip}:{email_clean}"

    if not rate_limiter.is_allowed(rate_key, max_attempts=5, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "RATE_LIMIT_EXCEEDED",
                "error_code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many failed login attempts. Please wait a minute before trying again.",
            },
        )

    # Generic error message to prevent account enumeration
    auth_failure_error = {
        "error": "INVALID_CREDENTIALS",
        "error_code": "INVALID_CREDENTIALS",
        "message": "Invalid email or password. Please verify your credentials and try again.",
    }

    user = db.query(UserModel).filter(UserModel.email == email_clean).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=auth_failure_error)

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=auth_failure_error)

    # Success: issue tokens and reset rate limit
    access_token = create_access_token(user.id, user.email)
    raw_refresh_token = _create_and_store_refresh_token(db, user.id)
    _set_refresh_cookie(response, raw_refresh_token)

    rate_limiter.reset(rate_key)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict(),
    }


@router.post("/logout", response_model=SuccessMessageResponse)
async def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> dict[str, str]:
    """Revoke active refresh token session and clear HTTP-only cookie."""
    if refresh_token:
        t_hash = hash_token(refresh_token)
        token_record = db.query(RefreshTokenModel).filter(RefreshTokenModel.token_hash == t_hash).first()
        if token_record:
            token_record.revoked = True
            db.commit()

    _clear_refresh_cookie(response)
    return {"status": "success", "message": "Successfully signed out."}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_session(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> dict[str, Any]:
    """Exchange valid HTTP-only refresh cookie for a fresh access token."""
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "MISSING_REFRESH_TOKEN",
                "error_code": "MISSING_REFRESH_TOKEN",
                "message": "Session expired or missing refresh token. Please sign in again.",
            },
        )

    t_hash = hash_token(refresh_token)
    token_record = (
        db.query(RefreshTokenModel)
        .filter(
            RefreshTokenModel.token_hash == t_hash,
            RefreshTokenModel.revoked.is_(False),
        )
        .first()
    )

    now = datetime.now(timezone.utc)
    # Check expiry (handle both timezone-aware and naive timestamps safely)
    expires = token_record.expires_at if token_record else None
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if not token_record or not expires or expires < now:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "INVALID_REFRESH_TOKEN",
                "error_code": "INVALID_REFRESH_TOKEN",
                "message": "Your session has expired. Please sign in again.",
            },
        )

    user = db.query(UserModel).filter(UserModel.id == token_record.user_id).first()
    if not user:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "USER_NOT_FOUND",
                "error_code": "USER_NOT_FOUND",
                "message": "User account no longer exists.",
            },
        )

    new_access_token = create_access_token(user.id, user.email)
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "user": user.to_dict(),
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: Annotated[UserModel, Depends(get_current_user)],
) -> dict[str, Any]:
    """Retrieve authenticated user's profile details."""
    return current_user.to_dict()


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Update user's name or preferred language."""
    if current_user.is_demo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "DEMO_ACCOUNT_READ_ONLY",
                "error_code": "DEMO_ACCOUNT_READ_ONLY",
                "message": "The demo account cannot be modified.",
            },
        )

    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip()
    if payload.preferred_language is not None:
        current_user.preferred_language = payload.preferred_language.strip()

    db.commit()
    db.refresh(current_user)
    return current_user.to_dict()


@router.post("/change-password", response_model=SuccessMessageResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Update account password, invalidating existing refresh tokens."""
    if current_user.is_demo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "DEMO_ACCOUNT_READ_ONLY",
                "error_code": "DEMO_ACCOUNT_READ_ONLY",
                "message": "The demo account password cannot be changed.",
            },
        )

    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "INVALID_CURRENT_PASSWORD",
                "error_code": "INVALID_CURRENT_PASSWORD",
                "message": "The current password you entered is incorrect.",
            },
        )

    is_valid_pw, pw_error = validate_password_strength(payload.new_password)
    if not is_valid_pw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "WEAK_PASSWORD",
                "error_code": "WEAK_PASSWORD",
                "message": pw_error or "Password does not meet security requirements.",
            },
        )

    current_user.password_hash = hash_password(payload.new_password)
    # Revoke all existing refresh sessions for security
    db.query(RefreshTokenModel).filter(RefreshTokenModel.user_id == current_user.id).update(
        {"revoked": True}
    )
    db.commit()
    return {"status": "success", "message": "Password updated successfully."}


@router.delete("/account", response_model=SuccessMessageResponse)
async def delete_account(
    response: Response,
    current_user: Annotated[UserModel, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Permanently delete user account, associated notices, and uploaded physical files."""
    if current_user.is_demo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "DEMO_ACCOUNT_PROTECTED",
                "error_code": "DEMO_ACCOUNT_PROTECTED",
                "message": "The shared demo account cannot be deleted.",
            },
        )

    # 1. Clean up physical files for all user notices
    notices = db.query(NoticeModel).filter(NoticeModel.user_id == current_user.id).all()
    for notice in notices:
        if notice.stored_path:
            p = Path(notice.stored_path)
            if p.exists() and p.is_file():
                try:
                    p.unlink()
                except Exception:
                    pass

    # 2. Delete user record (cascades to notices, checklist, reminders, tokens)
    db.delete(current_user)
    db.commit()

    _clear_refresh_cookie(response)
    return {
        "status": "success",
        "message": "Your account and all associated documents have been permanently deleted.",
    }


# --- STEP 4: Email Verification and Password Reset Endpoints ---


@router.get("/verify", response_model=SuccessMessageResponse)
async def verify_email(
    token: str,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Verify email address using one-time token."""
    t_hash = hash_token(token)
    token_record = (
        db.query(SecurityTokenModel)
        .filter(
            SecurityTokenModel.token_hash == t_hash,
            SecurityTokenModel.token_type == "email_verify",
            SecurityTokenModel.used.is_(False),
        )
        .first()
    )

    now = datetime.now(timezone.utc)
    expires = token_record.expires_at if token_record else None
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if not token_record or not expires or expires < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "INVALID_VERIFICATION_TOKEN",
                "error_code": "INVALID_VERIFICATION_TOKEN",
                "message": "This verification link is invalid or has expired. Please request a new one.",
            },
        )

    token_record.used = True
    user = db.query(UserModel).filter(UserModel.id == token_record.user_id).first()
    if user:
        user.is_verified = True
    db.commit()

    return {"status": "success", "message": "Your email address has been verified successfully."}


@router.post("/resend-verification", response_model=SuccessMessageResponse)
async def resend_verification(
    current_user: Annotated[UserModel, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Resend email verification link for current user."""
    if current_user.is_verified:
        return {"status": "success", "message": "Email address is already verified."}

    raw_verify_token, verify_token_hash = generate_secure_token()
    verify_record = SecurityTokenModel(
        user_id=current_user.id,
        token_hash=verify_token_hash,
        token_type="email_verify",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(verify_record)
    db.commit()

    email_sender.send_verification_email(
        current_user.email, raw_verify_token, current_user.full_name
    )
    return {"status": "success", "message": "Verification link sent to your email address."}


@router.post("/forgot-password", response_model=SuccessMessageResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Request password reset link. Always returns 200 to prevent email enumeration."""
    client_ip = _get_client_ip(request)
    email_clean = payload.email.lower().strip()
    rate_key = f"forgot:{client_ip}:{email_clean}"

    if not rate_limiter.is_allowed(rate_key, max_attempts=5, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "RATE_LIMIT_EXCEEDED",
                "error_code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many reset requests. Please wait a moment before trying again.",
            },
        )

    user = db.query(UserModel).filter(UserModel.email == email_clean).first()
    if user and not user.is_demo:
        raw_reset_token, reset_token_hash = generate_secure_token()
        reset_record = SecurityTokenModel(
            user_id=user.id,
            token_hash=reset_token_hash,
            token_type="password_reset",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
        db.add(reset_record)
        db.commit()
        email_sender.send_password_reset_email(user.email, raw_reset_token, user.full_name)

    return {
        "status": "success",
        "message": "If an account with that email exists, a password reset link has been sent.",
    }


@router.post("/reset-password", response_model=SuccessMessageResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    """Reset account password using single-use 30-minute token."""
    t_hash = hash_token(payload.token)
    token_record = (
        db.query(SecurityTokenModel)
        .filter(
            SecurityTokenModel.token_hash == t_hash,
            SecurityTokenModel.token_type == "password_reset",
            SecurityTokenModel.used.is_(False),
        )
        .first()
    )

    now = datetime.now(timezone.utc)
    expires = token_record.expires_at if token_record else None
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if not token_record or not expires or expires < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "INVALID_RESET_TOKEN",
                "error_code": "INVALID_RESET_TOKEN",
                "message": "This password reset link is invalid or has expired. Please request a new one.",
            },
        )

    is_valid_pw, pw_error = validate_password_strength(payload.new_password)
    if not is_valid_pw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "WEAK_PASSWORD",
                "error_code": "WEAK_PASSWORD",
                "message": pw_error or "Password does not meet security requirements.",
            },
        )

    user = db.query(UserModel).filter(UserModel.id == token_record.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "USER_NOT_FOUND", "message": "User not found."},
        )

    # Invalidate token and update password
    token_record.used = True
    user.password_hash = hash_password(payload.new_password)

    # Invalidate all existing refresh tokens
    db.query(RefreshTokenModel).filter(RefreshTokenModel.user_id == user.id).update(
        {"revoked": True}
    )
    db.commit()

    return {
        "status": "success",
        "message": "Your password has been successfully reset. You can now sign in with your new password.",
    }

