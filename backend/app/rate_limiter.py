"""In-memory rate limiter for Notice to Action API endpoints.

Provides node-local rate limiting using a sliding window algorithm with IP tracking.

Architectural Note on Multi-Worker / Production Deployments:
    This rate limiter stores state in process memory. In multi-worker environments
    (e.g., Gunicorn/Uvicorn with multiple worker processes) or multi-instance container
    clusters (e.g., Kubernetes, AWS ECS), each worker maintains its own independent rate
    counter. For distributed production environments requiring strict global quotas across
    all nodes, an external distributed store like Redis (e.g., Redis Token Bucket or
    SlowAPI with Redis backend) or an API Gateway (Cloudflare, AWS ALB, Nginx) should
    be utilized.
"""

import threading
import time

from fastapi import HTTPException, Request, status

from backend.app.config import get_settings


class InMemoryRateLimiter:
    """Thread-safe sliding-window in-memory rate limiter tracking client identifiers."""

    def __init__(
        self,
        max_requests: int | None = None,
        window_seconds: int | None = None,
        enabled: bool | None = None,
    ) -> None:
        settings = get_settings()
        self.max_requests = (
            max_requests if max_requests is not None else settings.RATE_LIMIT_UPLOAD_MAX
        )
        self.window_seconds = (
            window_seconds if window_seconds is not None else settings.RATE_LIMIT_UPLOAD_WINDOW_SEC
        )
        self.enabled = enabled if enabled is not None else settings.RATE_LIMIT_ENABLED
        self._requests: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, client_id: str) -> tuple[bool, int]:
        """Check whether the client is within rate limits.

        Args:
            client_id: Unique client identifier (typically remote IP address).

        Returns:
            Tuple of (is_allowed: bool, retry_after_seconds: int).
        """
        if not self.enabled:
            return True, 0

        now = time.time()
        cutoff = now - self.window_seconds

        with self._lock:
            # Clean timestamps older than the active sliding window
            timestamps = self._requests.get(client_id, [])
            valid_timestamps = [t for t in timestamps if t > cutoff]

            if len(valid_timestamps) >= self.max_requests:
                # Calculate remaining seconds until oldest request expires
                oldest = valid_timestamps[0]
                retry_after = max(1, int(self.window_seconds - (now - oldest)))
                self._requests[client_id] = valid_timestamps
                return False, retry_after

            # Allow request and record timestamp
            valid_timestamps.append(now)
            self._requests[client_id] = valid_timestamps
            return True, 0

    def reset(self) -> None:
        """Clear all recorded request timestamps (used in test fixtures)."""
        with self._lock:
            self._requests.clear()


# Default singleton instance configured from application settings
upload_rate_limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP from X-Forwarded-For or direct socket connection."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # First IP in comma-separated list is the original client IP
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


def check_upload_rate_limit(request: Request) -> None:
    """FastAPI dependency enforcing upload rate limits.

    Raises:
        HTTPException(429): When client has exceeded the configured upload rate limit.
    """
    client_ip = get_client_ip(request)
    allowed, retry_after = upload_rate_limiter.check(client_ip)

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "RATE_LIMIT_EXCEEDED",
                "message": (
                    f"Too many upload requests. Maximum permitted is {upload_rate_limiter.max_requests} "
                    f"per {upload_rate_limiter.window_seconds} seconds. Please try again in {retry_after} seconds."
                ),
            },
            headers={"Retry-After": str(retry_after)},
        )
