"""Unit tests for GeminiLLMClient: retries, backoff, jitter, fallback model, and secret redaction."""

import json
import logging
from typing import Any

import httpx
import pytest

from extraction.llm_client import (
    GeminiLLMClient,
    LLMError,
    sanitize_message,
)


def _make_gemini_response(text: str) -> dict[str, Any]:
    """Helper creating standard Gemini JSON candidate payload."""
    return {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": text}],
                    "role": "model",
                },
                "finishReason": "STOP",
            }
        ]
    }


def test_gemini_client_success_first_attempt() -> None:
    """Verify GeminiLLMClient returns clean response on successful 200 response."""
    valid_payload = json.dumps({"notice_id": "notice-1", "category": "utility"})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_make_gemini_response(valid_payload))

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        transport=transport,
    )

    out = client.generate_json("system prompt", "user prompt")
    parsed = json.loads(out)
    assert parsed["notice_id"] == "notice-1"


@pytest.mark.parametrize("status_code", [429, 500, 502, 503, 504])
def test_gemini_client_retry_success_on_retryable_status(status_code: int) -> None:
    """Verify 429, 500, 502, 503, 504 temporary errors retry and succeed on subsequent attempt."""
    call_count = 0
    valid_payload = json.dumps({"notice_id": "notice-retry-success"})
    sleep_calls: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(status_code, text=f"Temporary error {status_code}")
        return httpx.Response(200, json=_make_gemini_response(valid_payload))

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        transport=transport,
        backoff_delays=[0.01, 0.02, 0.03],
        sleep_fn=sleep_calls.append,
    )

    res = client.generate_json("sys", "usr")
    assert json.loads(res)["notice_id"] == "notice-retry-success"
    assert call_count == 2
    assert len(sleep_calls) == 1
    # Check that sleep duration includes base delay + jitter
    assert sleep_calls[0] >= 0.01


def test_gemini_client_retry_success_on_timeout() -> None:
    """Verify httpx.TimeoutException retries and succeeds on next attempt."""
    call_count = 0
    valid_payload = json.dumps({"notice_id": "notice-timeout-resolved"})
    sleep_calls: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.ReadTimeout("Read timed out after 60s")
        return httpx.Response(200, json=_make_gemini_response(valid_payload))

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        transport=transport,
        backoff_delays=[0.01, 0.02, 0.03],
        sleep_fn=sleep_calls.append,
    )

    res = client.generate_json("sys", "usr")
    assert json.loads(res)["notice_id"] == "notice-timeout-resolved"
    assert call_count == 2
    assert len(sleep_calls) == 1


@pytest.mark.parametrize("status_code", [400, 401, 403, 404])
def test_gemini_client_non_retryable_errors_fail_immediately(status_code: int) -> None:
    """Verify 400, 401, 403, 404 do NOT retry and raise LLMError immediately."""
    call_count = 0
    sleep_calls: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(status_code, text=f"Client error {status_code}")

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        transport=transport,
        backoff_delays=[0.01, 0.02, 0.03],
        sleep_fn=sleep_calls.append,
    )

    with pytest.raises(LLMError) as exc_info:
        client.generate_json("sys", "usr")

    assert exc_info.value.status_code == status_code
    # Must have failed immediately on attempt 1 without retry
    assert call_count == 1
    assert len(sleep_calls) == 0


def test_gemini_client_retry_exhaustion_without_fallback() -> None:
    """Verify exhaustion across all retries raises LLMError with retries_exhausted=True."""
    call_count = 0
    sleep_calls: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(503, text="Service Overloaded")

    transport = httpx.MockTransport(handler)
    delays = [0.01, 0.02, 0.03]
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        transport=transport,
        backoff_delays=delays,
        sleep_fn=sleep_calls.append,
    )

    with pytest.raises(LLMError) as exc_info:
        client.generate_json("sys", "usr")

    # Primary model called: 1 initial + 3 retries = 4 calls
    assert call_count == 4
    assert len(sleep_calls) == 3
    assert exc_info.value.retries_exhausted is True
    assert exc_info.value.status_code == 503


def test_gemini_client_fallback_model_success_after_retries() -> None:
    """Verify optional LLM_FALLBACK_MODEL is tried once after retries are used up and succeeds."""
    models_called: list[str] = []
    valid_payload = json.dumps({"notice_id": "notice-from-fallback-model"})
    sleep_calls: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        # Extract model from url: .../models/{model}:generateContent
        if "gemini-1.5-flash" in url_str:
            models_called.append("gemini-1.5-flash")
            return httpx.Response(503, text="Flash model busy")
        elif "gemini-1.5-pro" in url_str:
            models_called.append("gemini-1.5-pro")
            return httpx.Response(200, json=_make_gemini_response(valid_payload))
        return httpx.Response(400, text="Unknown model")

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        fallback_model="gemini-1.5-pro",
        transport=transport,
        backoff_delays=[0.01, 0.02],
        sleep_fn=sleep_calls.append,
    )

    res = client.generate_json("sys", "usr")
    assert json.loads(res)["notice_id"] == "notice-from-fallback-model"
    # Primary model called 1 initial + 2 retries = 3 times
    assert models_called.count("gemini-1.5-flash") == 3
    # Fallback model called exactly once
    assert models_called.count("gemini-1.5-pro") == 1


def test_gemini_client_fallback_model_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify fallback model is picked up from LLM_FALLBACK_MODEL environment variable."""
    monkeypatch.setenv("LLM_FALLBACK_MODEL", "gemini-2.0-flash-exp")
    models_called: list[str] = []
    valid_payload = json.dumps({"notice_id": "notice-from-env-fallback"})

    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        if "gemini-1.5-flash" in url_str:
            models_called.append("gemini-1.5-flash")
            return httpx.Response(429, text="Rate limit")
        elif "gemini-2.0-flash-exp" in url_str:
            models_called.append("gemini-2.0-flash-exp")
            return httpx.Response(200, json=_make_gemini_response(valid_payload))
        return httpx.Response(500, text="Unexpected")

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        transport=transport,
        backoff_delays=[0.01],
        sleep_fn=lambda _: None,
    )

    res = client.generate_json("sys", "usr")
    assert json.loads(res)["notice_id"] == "notice-from-env-fallback"
    assert models_called.count("gemini-2.0-flash-exp") == 1


def test_gemini_client_fallback_model_failure_raises_llmerror() -> None:
    """Verify that if fallback model also fails, LLMError is raised with retries_exhausted=True."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="High demand on all models")

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        fallback_model="gemini-1.5-pro",
        transport=transport,
        backoff_delays=[0.01],
        sleep_fn=lambda _: None,
    )

    with pytest.raises(LLMError) as exc_info:
        client.generate_json("sys", "usr")

    assert exc_info.value.retries_exhausted is True
    assert "fallback" in exc_info.value.message


def test_gemini_client_never_logs_api_key(caplog: pytest.LogCaptureFixture) -> None:
    """Verify secret API key is never present in log records or error messages."""
    secret_key = "AIzaSySuperSecretKey123456789"

    def handler(request: httpx.Request) -> httpx.Response:
        # Return 503 error reflecting query parameter
        return httpx.Response(
            503,
            text=f"Server error for request with key={secret_key}",
        )

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key=secret_key,
        model="gemini-1.5-flash",
        fallback_model="gemini-fallback",
        transport=transport,
        backoff_delays=[0.01],
        sleep_fn=lambda _: None,
    )

    with caplog.at_level(logging.DEBUG):
        with pytest.raises(LLMError) as exc_info:
            client.generate_json("sys", "usr")

    # 1. API key must NOT be in the exception message
    assert secret_key not in exc_info.value.message
    assert "***REDACTED***" in exc_info.value.message or "Server error" in exc_info.value.message

    # 2. API key must NOT be in any captured log record
    for record in caplog.records:
        assert secret_key not in record.message
        assert secret_key not in str(record.args)


def test_sanitize_message_utility() -> None:
    """Verify sanitize_message redacts explicit secret and key/bearer regex patterns."""
    secret = "SECRET_123"
    msg = f"Failed at https://api.google.com?key={secret}&other=1 with Bearer {secret}"
    sanitized = sanitize_message(msg, secret=secret)

    assert secret not in sanitized
    assert "?key=***REDACTED***" in sanitized
    assert "Bearer ***REDACTED***" in sanitized


def test_gemini_client_fallback_on_404_model_not_found(caplog: pytest.LogCaptureFixture) -> None:
    """Verify fallback model is tried immediately when primary returns 404 'model not found/available'."""
    models_called: list[str] = []
    valid_payload = json.dumps({"notice_id": "notice-404-fallback-success"})

    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        if "gemini-obsolete" in url_str:
            models_called.append("gemini-obsolete")
            return httpx.Response(
                404, text="models/gemini-obsolete is not found or no longer available."
            )
        elif "gemini-1.5-flash" in url_str:
            models_called.append("gemini-1.5-flash")
            return httpx.Response(200, json=_make_gemini_response(valid_payload))
        return httpx.Response(500, text="Unexpected")

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-obsolete",
        fallback_model="gemini-1.5-flash",
        transport=transport,
        backoff_delays=[0.01, 0.02],
        sleep_fn=lambda _: None,
    )

    with caplog.at_level(logging.INFO):
        res = client.generate_json("sys", "usr")

    assert json.loads(res)["notice_id"] == "notice-404-fallback-success"
    # Primary model called once (not retried across delays on 404)
    assert models_called.count("gemini-obsolete") == 1
    # Fallback model called and succeeded
    assert models_called.count("gemini-1.5-flash") == 1
    # Log must state which model answered
    assert "Model 'gemini-1.5-flash' answered successfully." in caplog.text


def test_gemini_client_logs_primary_model_answered(caplog: pytest.LogCaptureFixture) -> None:
    """Verify GeminiLLMClient logs which model answered when primary succeeds."""
    valid_payload = json.dumps({"notice_id": "notice-primary-success"})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_make_gemini_response(valid_payload))

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-1.5-flash",
        transport=transport,
    )

    with caplog.at_level(logging.INFO):
        res = client.generate_json("sys", "usr")

    assert json.loads(res)["notice_id"] == "notice-primary-success"
    assert "Model 'gemini-1.5-flash' answered successfully." in caplog.text


def test_gemini_client_404_without_fallback_raises_immediately() -> None:
    """Verify 404 without a fallback model configured raises LLMError immediately."""
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(404, text="model not found")

    transport = httpx.MockTransport(handler)
    client = GeminiLLMClient(
        api_key="test-key",
        model="gemini-nonexistent",
        fallback_model=None,
        transport=transport,
        backoff_delays=[0.01, 0.02],
        sleep_fn=lambda _: None,
    )

    with pytest.raises(LLMError) as exc_info:
        client.generate_json("sys", "usr")

    assert exc_info.value.status_code == 404
    assert exc_info.value.retries_exhausted is False
    assert call_count == 1


