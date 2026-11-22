"""SQLAlchemy models for users, refresh tokens, and security tokens."""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.app.database import Base


class UserModel(Base):
    """SQLAlchemy model representing an authenticated user."""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    is_verified = Column(Boolean, default=False, nullable=False)
    preferred_language = Column(String(10), default="en", nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)

    # Relationships
    notices = relationship(
        "NoticeModel",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="NoticeModel.created_at.desc()",
    )
    refresh_tokens = relationship(
        "RefreshTokenModel",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    verification_tokens = relationship(
        "SecurityTokenModel",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    def to_dict(self) -> dict[str, Any]:
        """Convert User model to a safe dictionary excluding password hash."""
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_verified": self.is_verified,
            "preferred_language": self.preferred_language,
            "is_demo": self.is_demo,
        }


class RefreshTokenModel(Base):
    """SQLAlchemy model storing hashed refresh tokens for session renewal."""

    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash = Column(String(64), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    revoked = Column(Boolean, default=False, nullable=False)

    user = relationship("UserModel", back_populates="refresh_tokens")


class SecurityTokenModel(Base):
    """SQLAlchemy model for single-use email verification and password reset tokens."""

    __tablename__ = "security_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash = Column(String(64), nullable=False, index=True)
    token_type = Column(String(32), nullable=False, index=True)  # "email_verify" | "password_reset"
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    used = Column(Boolean, default=False, nullable=False)

    user = relationship("UserModel", back_populates="verification_tokens")

