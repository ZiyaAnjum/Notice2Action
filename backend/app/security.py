"""Security, cryptographic primitives, token management, and password hashing."""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any

from backend.app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Extremely common passwords to immediately reject per security guidelines
COMMON_PASSWORDS = {
    "password",
    "password123",
    "12345678",
    "123456789",
    "1234567890",
    "qwerty123",
    "admin123",
    "letmein123",
    "welcome123",
    "iloveyou",
    "sunshine",
    "princess",
    "football",
    "monkey123",
    "dragon123",
}

# Optional external bcrypt / argon2 if installed
try:
    import bcrypt  # type: ignore

    HAS_BCRYPT = True
except ImportError:
    HAS_BCRYPT = False

try:
    import argon2  # type: ignore

    HAS_ARGON2 = True
except ImportError:
    HAS_ARGON2 = False


def validate_password_strength(password: str) -> tuple[bool, str | None]:
    """Validate password against length and common password blacklists."""
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if password.lower().strip() in COMMON_PASSWORDS:
        return False, "This password is too common and easily guessed. Please choose a stronger password."
    return True, None


def hash_password(password: str) -> str:
    """Hash password using argon2, bcrypt, or standard library scrypt."""
    if HAS_ARGON2:
        ph = argon2.PasswordHasher()
        return ph.hash(password)
    if HAS_BCRYPT:
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    # Standard library scrypt (RFC 7914 memory-hard key derivation)
    salt = secrets.token_bytes(16)
    n, r, p = 16384, 8, 1
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=32 * 1024 * 1024)
    salt_hex = salt.hex()
    key_hex = key.hex()
    return f"$scrypt$n={n},r={r},p={p}${salt_hex}${key_hex}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password string."""
    try:
        if hashed_password.startswith("$argon2"):
            if HAS_ARGON2:
                ph = argon2.PasswordHasher()
                return ph.verify(hashed_password, plain_password)
            return False

        if hashed_password.startswith("$2a$") or hashed_password.startswith("$2b$"):
            if HAS_BCRYPT:
                return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
            return False

        if hashed_password.startswith("$scrypt$"):
            parts = hashed_password.split("$")
            if len(parts) != 5:
                return False
            # parts: ['', 'scrypt', 'n=16384,r=8,p=1', salt_hex, key_hex]
            params = dict(param.split("=") for param in parts[2].split(","))
            n = int(params["n"])
            r = int(params["r"])
            p = int(params["p"])
            salt = bytes.fromhex(parts[3])
            expected_key = bytes.fromhex(parts[4])
            computed_key = hashlib.scrypt(
                plain_password.encode("utf-8"),
                salt=salt,
                n=n,
                r=r,
                p=p,
                maxmem=32 * 1024 * 1024,
            )
            return secrets.compare_digest(computed_key, expected_key)

        return False
    except Exception as exc:
        logger.warning("Password verification error: %s", type(exc).__name__)
        return False


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _base64url_decode(data: str) -> bytes:
    padding = "=" * (4 - (len(data) % 4)) if len(data) % 4 != 0 else ""
    return base64.urlsafe_b64decode((data + padding).encode("utf-8"))


def create_access_token(
    user_id: str,
    email: str,
    expires_delta: timedelta | None = None,
) -> str:
    """Create short-lived HS256 JWT access token (15 minutes default)."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    delta_seconds = int(expires_delta.total_seconds()) if expires_delta else (settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    exp = now + delta_seconds

    payload = {
        "sub": user_id,
        "email": email.lower().strip(),
        "iat": now,
        "exp": exp,
    }

    encoded_header = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")

    secret_key = (settings.JWT_SECRET or settings.SECRET_KEY).encode("utf-8")
    signature = hmac.new(secret_key, signing_input, hashlib.sha256).digest()
    encoded_sig = _base64url_encode(signature)

    return f"{encoded_header}.{encoded_payload}.{encoded_sig}"


def verify_access_token(token: str) -> dict[str, Any] | None:
    """Verify and decode HS256 JWT access token. Returns claims or None if invalid/expired."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        encoded_header, encoded_payload, encoded_sig = parts
        signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")

        secret_key = (settings.JWT_SECRET or settings.SECRET_KEY).encode("utf-8")
        expected_sig = hmac.new(secret_key, signing_input, hashlib.sha256).digest()
        provided_sig = _base64url_decode(encoded_sig)

        if not secrets.compare_digest(expected_sig, provided_sig):
            return None

        payload_bytes = _base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))

        now = int(time.time())
        if payload.get("exp", 0) < now:
            return None

        return payload
    except Exception:
        return None


def generate_secure_token() -> tuple[str, str]:
    """Generate cryptographically secure random token and its SHA-256 hash."""
    raw = secrets.token_urlsafe(36)
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, token_hash


def hash_token(raw_token: str) -> str:
    """Hash a token for database lookup."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


class RateLimiter:
    """Thread-safe sliding-window rate limiter per key (e.g., ip:email)."""

    def __init__(self) -> None:
        self._history: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def is_allowed(self, key: str, max_attempts: int = 5, window_seconds: int = 60) -> bool:
        """Check if request is allowed under sliding window limit."""
        now = time.time()
        with self._lock:
            timestamps = self._history[key]
            # Prune timestamps older than window
            cutoff = now - window_seconds
            valid = [ts for ts in timestamps if ts > cutoff]
            if len(valid) >= max_attempts:
                self._history[key] = valid
                return False
            valid.append(now)
            self._history[key] = valid
            return True

    def reset(self, key: str) -> None:
        """Reset attempts for a specific key upon successful action."""
        with self._lock:
            self._history.pop(key, None)


# Global rate limiter singleton
rate_limiter = RateLimiter()

