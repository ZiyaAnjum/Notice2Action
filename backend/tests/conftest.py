"""Global pytest configuration and fixtures for backend test suite."""

import pytest

from backend.app.rate_limiter import upload_rate_limiter


@pytest.fixture(autouse=True)
def reset_global_rate_limiter() -> None:
    """Ensure in-memory rate limiter starts clean for each test function."""
    upload_rate_limiter.reset()
