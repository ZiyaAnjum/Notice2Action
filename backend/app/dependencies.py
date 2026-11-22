"""FastAPI dependency providers for Notice to Action backend."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.user import UserModel
from backend.app.security import verify_access_token
from extraction.llm_client import BaseLLMClient, get_llm_client


def get_llm() -> BaseLLMClient:
    """Provide LLM client instance for dependency injection.

    Overridable in tests via app.dependency_overrides[get_llm] = lambda: FakeLLMClient(...).
    """
    return get_llm_client()


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> UserModel:
    """Extract and validate JWT access token from Authorization header.

    Raises:
        HTTPException 401: If token is missing, expired, or invalid.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "UNAUTHORIZED",
                "error_code": "UNAUTHORIZED",
                "message": "Authentication required. Please sign in to continue.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header.split(" ", 1)[1].strip()
    payload = verify_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "TOKEN_EXPIRED",
                "error_code": "TOKEN_EXPIRED",
                "message": "Your session has expired or is invalid. Please sign in again.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload["sub"]
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "USER_NOT_FOUND",
                "error_code": "USER_NOT_FOUND",
                "message": "Account not found or no longer active.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_optional_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> UserModel | None:
    """Extract current user if Authorization header is present, else None."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    payload = verify_access_token(token)
    if not payload or not payload.get("sub"):
        return None

    return db.query(UserModel).filter(UserModel.id == payload["sub"]).first()
