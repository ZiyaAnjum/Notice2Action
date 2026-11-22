"""Pluggable email service interface supporting Console and SMTP backends."""

import logging
import smtplib
from abc import ABC, abstractmethod
from email.message import EmailMessage

from backend.app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class BaseEmailSender(ABC):
    """Abstract base class for email delivery backends."""

    @abstractmethod
    def send_verification_email(self, email: str, token: str, full_name: str) -> bool:
        """Send account email verification link."""
        pass

    @abstractmethod
    def send_password_reset_email(self, email: str, token: str, full_name: str) -> bool:
        """Send password reset link."""
        pass


class ConsoleEmailSender(BaseEmailSender):
    """Development/testing email sender that logs actionable links to stdout/logger."""

    def send_verification_email(self, email: str, token: str, full_name: str) -> bool:
        verify_url = f"{settings.FRONTEND_URL}/verify?token={token}"
        logger.info(
            "\n" + "=" * 70 + "\n"
            f"[EMAIL - VERIFY ACCOUNT] To: {email} ({full_name})\n"
            f"Please verify your Notice2Action email address using the link below (valid for 24 hours):\n"
            f"{verify_url}\n"
            + "=" * 70
        )
        return True

    def send_password_reset_email(self, email: str, token: str, full_name: str) -> bool:
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        logger.info(
            "\n" + "=" * 70 + "\n"
            f"[EMAIL - PASSWORD RESET] To: {email} ({full_name})\n"
            f"You requested a password reset for Notice2Action (valid for 30 minutes):\n"
            f"{reset_url}\n"
            + "=" * 70
        )
        return True


class SMTPEmailSender(BaseEmailSender):
    """Production SMTP email sender."""

    def __init__(self) -> None:
        self.host = settings.SMTP_HOST or "localhost"
        self.port = settings.SMTP_PORT
        self.user = settings.SMTP_USER
        self.password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL

    def send_verification_email(self, email: str, token: str, full_name: str) -> bool:
        verify_url = f"{settings.FRONTEND_URL}/verify?token={token}"
        subject = "Verify your Notice2Action account"
        body = (
            f"Hello {full_name},\n\n"
            f"Thank you for registering with Notice2Action. Please verify your email by clicking the link below:\n\n"
            f"{verify_url}\n\n"
            "This link will expire in 24 hours. If you did not create this account, please ignore this email.\n"
        )
        return self._send_smtp(email, subject, body)

    def send_password_reset_email(self, email: str, token: str, full_name: str) -> bool:
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        subject = "Reset your Notice2Action password"
        body = (
            f"Hello {full_name},\n\n"
            f"We received a request to reset your Notice2Action password. Use the link below to set a new password:\n\n"
            f"{reset_url}\n\n"
            "This link is valid for 30 minutes and can only be used once.\n"
            "If you did not request this, you can safely ignore this message.\n"
        )
        return self._send_smtp(email, subject, body)

    def _send_smtp(self, recipient: str, subject: str, content: str) -> bool:
        try:
            msg = EmailMessage()
            msg.set_content(content)
            msg["Subject"] = subject
            msg["From"] = self.from_email
            msg["To"] = recipient

            with smtplib.SMTP(self.host, self.port, timeout=10) as server:
                server.starttls()
                if self.user and self.password:
                    server.login(self.user, self.password)
                server.send_message(msg)
            return True
        except Exception as exc:
            logger.error("Failed to send email via SMTP to %s: %s", recipient, exc)
            return False


def get_email_sender() -> BaseEmailSender:
    """Return configured email sender singleton."""
    if settings.EMAIL_BACKEND.lower() == "smtp" and settings.SMTP_HOST:
        return SMTPEmailSender()
    return ConsoleEmailSender()

