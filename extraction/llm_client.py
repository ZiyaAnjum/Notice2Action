"""LLM client interface and provider implementations for Notice to Action.

Provides a unified BaseLLMClient interface, a real Gemini API client using
structured JSON mode at temperature 0, an OpenAI-compatible client, and a
FakeLLMClient for isolated deterministic tests.
"""

import json
import logging
import os
import random
import re
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404}
FRIENDLY_BUSY_MESSAGE = "The AI service is busy right now. Please try again in a few minutes."


def sanitize_message(message: str, secret: str | None = None) -> str:
    """Mask sensitive credentials such as API keys from messages and URLs."""
    if not message:
        return ""
    sanitized = str(message)
    if secret and secret.strip():
        sanitized = sanitized.replace(secret.strip(), "***REDACTED***")
    # Redact query parameter patterns like ?key=... or &key=...
    sanitized = re.sub(r"([?&]key=)[^& \t\r\n]+", r"\1***REDACTED***", sanitized)
    # Redact Authorization header values like Bearer ...
    sanitized = re.sub(r"(Bearer\s+)[^ \t\r\n]+", r"\1***REDACTED***", sanitized)
    # Redact x-goog-api-key header patterns
    sanitized = re.sub(r"(x-goog-api-key[:=]\s*)[^ \t\r\n]+", r"\1***REDACTED***", sanitized)
    return sanitized


class LLMError(Exception):
    """Exception raised when an LLM provider request fails."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        is_timeout: bool = False,
        retries_exhausted: bool = False,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.is_timeout = is_timeout
        self.retries_exhausted = retries_exhausted

    @property
    def is_retryable(self) -> bool:
        """Indicate whether the error is eligible for retry."""
        if self.is_timeout:
            return True
        return self.status_code in RETRYABLE_STATUS_CODES


def clean_json_markdown(text: str) -> str:
    """Strip markdown code fence wrappers from a model response string."""
    trimmed = text.strip()
    match = re.search(r"^```(?:json)?\s*(.*?)\s*```$", trimmed, re.DOTALL)
    if match:
        return match.group(1).strip()
    return trimmed


class BaseLLMClient(ABC):
    """Abstract interface for LLM client providers."""

    @abstractmethod
    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Generate a JSON string response given a system prompt and user prompt.

        Args:
            system_prompt: System instruction guiding the model behavior.
            user_prompt: User instruction containing document text and payload.

        Returns:
            Raw JSON string produced by the model.

        Raises:
            LLMError: If the API request fails or credentials are missing.
        """
        pass


class GeminiLLMClient(BaseLLMClient):
    """Google Gemini API client using structured JSON output mode at temperature 0."""

    DEFAULT_MODEL = "gemini-1.5-flash"
    DEFAULT_BACKOFF_DELAYS = (2.0, 5.0, 10.0)

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        fallback_model: str | None = None,
        timeout_seconds: float = 60.0,
        backoff_delays: tuple[float, ...] | list[float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.api_key = (
            api_key
            if api_key is not None
            else (os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY"))
        )
        self.model = model or os.getenv("LLM_MODEL") or self.DEFAULT_MODEL
        self.fallback_model = (
            fallback_model if fallback_model is not None else os.getenv("LLM_FALLBACK_MODEL")
        )
        self.timeout = timeout_seconds
        self.backoff_delays = (
            tuple(backoff_delays) if backoff_delays is not None else self.DEFAULT_BACKOFF_DELAYS
        )
        self.sleep_fn = sleep_fn or time.sleep
        self.transport = transport

    def _post_generate_content(
        self, target_model: str, system_prompt: str, user_prompt: str
    ) -> str:
        """Execute single generateContent HTTP request against specified Gemini model."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent"
        # Pass API key via official x-goog-api-key header to prevent key leakage in URLs and logs
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json",
            },
        }

        with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
            response = client.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            safe_body = sanitize_message(response.text, self.api_key)
            raise LLMError(
                f"Gemini API returned status {response.status_code}: {safe_body}",
                status_code=response.status_code,
            )

        data = response.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise LLMError("Gemini API returned no candidates in the response.")

        first_candidate = candidates[0]
        parts = first_candidate.get("content", {}).get("parts", [])
        if not parts:
            raise LLMError("Gemini API candidate contained no text parts.")

        raw_text = parts[0].get("text", "")
        return clean_json_markdown(raw_text)

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Call Gemini generateContent with exponential backoff and optional fallback model."""
        if not self.api_key:
            raise LLMError(
                "Gemini API key is not configured. Please set the LLM_API_KEY or "
                "GEMINI_API_KEY environment variable."
            )

        delays = list(self.backoff_delays)
        max_attempts = len(delays) + 1
        last_err_msg: str = ""
        last_status_code: int | None = None
        last_is_timeout = False

        for attempt in range(max_attempts):
            try:
                res = self._post_generate_content(self.model, system_prompt, user_prompt)
                logger.info("Model '%s' answered successfully.", self.model)
                return res
            except httpx.TimeoutException as exc:
                last_is_timeout = True
                last_status_code = None
                safe_err = sanitize_message(str(exc), self.api_key)
                last_err_msg = f"Network timeout: {safe_err}"
                logger.warning(
                    "Gemini request timed out on model '%s' (attempt %d/%d): %s",
                    self.model,
                    attempt + 1,
                    max_attempts,
                    safe_err,
                )
            except LLMError as exc:
                last_is_timeout = exc.is_timeout
                last_status_code = exc.status_code
                safe_err = sanitize_message(exc.message, self.api_key)
                last_err_msg = safe_err

                # Fallback model must also be tried when primary returns 404 (model no longer available)
                if exc.status_code == 404:
                    if (
                        self.fallback_model
                        and self.fallback_model.strip()
                        and self.fallback_model.strip() != self.model
                    ):
                        fallback = self.fallback_model.strip()
                        logger.warning(
                            "Primary model '%s' returned 404 (model no longer available / not found): %s. Trying fallback model '%s'...",
                            self.model,
                            safe_err,
                            fallback,
                        )
                        try:
                            res = self._post_generate_content(fallback, system_prompt, user_prompt)
                            logger.info("Model '%s' answered successfully.", fallback)
                            return res
                        except Exception as fb_exc:
                            safe_fb_err = sanitize_message(str(fb_exc), self.api_key)
                            logger.error(
                                "Fallback model '%s' also failed after primary 404: %s",
                                fallback,
                                safe_fb_err,
                            )
                            fb_status = getattr(fb_exc, "status_code", 404)
                            raise LLMError(
                                f"Gemini API primary model '{self.model}' returned 404 and fallback to '{fallback}' failed: {safe_fb_err}",
                                status_code=fb_status,
                                is_timeout=isinstance(fb_exc, httpx.TimeoutException),
                                retries_exhausted=True,
                            ) from None

                    logger.error(
                        "Primary model '%s' returned 404 (model no longer available / not found) and no fallback configured: %s",
                        self.model,
                        safe_err,
                    )
                    raise LLMError(
                        safe_err,
                        status_code=404,
                        is_timeout=False,
                        retries_exhausted=False,
                    ) from None

                is_retryable = (exc.status_code in RETRYABLE_STATUS_CODES) or exc.is_timeout
                if not is_retryable:
                    logger.error(
                        "Non-retryable error on model '%s' (status %s): %s",
                        self.model,
                        exc.status_code,
                        safe_err,
                    )
                    raise LLMError(
                        safe_err,
                        status_code=exc.status_code,
                        is_timeout=False,
                        retries_exhausted=False,
                    ) from None

                logger.warning(
                    "Retryable error on model '%s' (status %s, attempt %d/%d): %s",
                    self.model,
                    exc.status_code,
                    attempt + 1,
                    max_attempts,
                    safe_err,
                )
            except httpx.RequestError as exc:
                safe_err = sanitize_message(str(exc), self.api_key)
                logger.error("Network error on model '%s': %s", self.model, safe_err)
                raise LLMError(f"Network error connecting to Gemini API: {safe_err}") from None

            # If retryable and retries remain, back off with random jitter
            if attempt < len(delays):
                base_delay = delays[attempt]
                jitter = random.uniform(0.1, 0.5)
                sleep_duration = base_delay + jitter
                logger.info(
                    "Backing off for %.2fs before retrying model '%s'...",
                    sleep_duration,
                    self.model,
                )
                self.sleep_fn(sleep_duration)

        # Primary model retries are used up
        logger.warning(
            "Retries exhausted for primary model '%s' (%d attempts).",
            self.model,
            max_attempts,
        )

        # Support optional LLM_FALLBACK_MODEL, tried once after retries are used up
        if (
            self.fallback_model
            and self.fallback_model.strip()
            and self.fallback_model.strip() != self.model
        ):
            fallback = self.fallback_model.strip()
            logger.info("Attempting fallback model '%s' once...", fallback)
            try:
                res = self._post_generate_content(fallback, system_prompt, user_prompt)
                logger.info("Model '%s' answered successfully.", fallback)
                return res
            except Exception as exc:
                safe_fallback_err = sanitize_message(str(exc), self.api_key)
                logger.error(
                    "Fallback model '%s' also failed: %s",
                    fallback,
                    safe_fallback_err,
                )
                fallback_status = getattr(exc, "status_code", last_status_code)
                fallback_timeout = isinstance(exc, httpx.TimeoutException) or last_is_timeout
                raise LLMError(
                    f"Gemini API request failed after retries and fallback to '{fallback}': {safe_fallback_err}",
                    status_code=fallback_status,
                    is_timeout=fallback_timeout,
                    retries_exhausted=True,
                ) from None

        # No fallback model configured or fallback model matched primary model
        raise LLMError(
            f"Gemini API request failed after retries: {last_err_msg}",
            status_code=last_status_code,
            is_timeout=last_is_timeout,
            retries_exhausted=True,
        )


class OpenAILLMClient(BaseLLMClient):
    """OpenAI API client using json_object response format at temperature 0."""

    DEFAULT_MODEL = "gpt-4o-mini"

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str = "https://api.openai.com/v1",
        timeout_seconds: float = 60.0,
    ) -> None:
        self.api_key = (
            api_key
            if api_key is not None
            else (os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"))
        )
        self.model = model or os.getenv("LLM_MODEL") or self.DEFAULT_MODEL
        self.base_url = os.getenv("OPENAI_BASE_URL", base_url).rstrip("/")
        self.timeout = timeout_seconds

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Call OpenAI chat completions endpoint in JSON mode."""
        if not self.api_key:
            raise LLMError(
                "OpenAI API key is not configured. Please set the LLM_API_KEY or "
                "OPENAI_API_KEY environment variable."
            )

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, headers=headers, json=payload)

            if response.status_code != 200:
                safe_err = sanitize_message(response.text, self.api_key)
                raise LLMError(
                    f"OpenAI API returned status {response.status_code}: {safe_err}",
                    status_code=response.status_code,
                )

            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                raise LLMError("OpenAI API returned no choices.")

            content = choices[0].get("message", {}).get("content", "")
            logger.info("Model '%s' answered successfully.", self.model)
            return clean_json_markdown(content)

        except httpx.RequestError as exc:
            safe_err = sanitize_message(str(exc), self.api_key)
            raise LLMError(f"Network error connecting to OpenAI API: {safe_err}") from None


class FakeLLMClient(BaseLLMClient):
    """Mock LLM client returning canned responses for testing.

    Never makes external API calls. Records all invocations to inspect prompt structure.
    Supports returning JSON strings, dictionaries, or raising exceptions/errors.
    """

    def __init__(
        self,
        responses: list[Any] | Any | None = None,
        model: str = "fake-model",
    ) -> None:
        self.model = model
        self.calls: list[dict[str, str]] = []
        self._responses: list[Any] = []

        if responses is not None:
            self.set_responses(responses)

    def set_responses(self, responses: list[Any] | Any) -> None:
        """Reset or configure canned responses queue."""
        self._responses = []
        if isinstance(responses, list):
            for resp in responses:
                if isinstance(resp, (dict, list)):
                    self._responses.append(json.dumps(resp))
                else:
                    self._responses.append(resp)
        elif isinstance(responses, (dict, list)):
            self._responses.append(json.dumps(responses))
        else:
            self._responses.append(responses)

    @property
    def call_count(self) -> int:
        """Number of calls made to generate_json."""
        return len(self.calls)

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Record the call and return the next canned response or raise configured exception."""
        self.calls.append({"system_prompt": system_prompt, "user_prompt": user_prompt})

        if not self._responses:
            # Default fallback mock response
            return json.dumps(
                {
                    "notice_id": "notice-mock-001",
                    "schema_version": "1.0",
                    "category": "scholarship_or_college",
                    "notice_title": {
                        "text": "Mock Notice",
                        "evidence_quote": "not_found",
                        "source_page": "not_found",
                        "status": "not_found",
                    },
                    "issuing_organisation": {
                        "text": "Mock Authority",
                        "evidence_quote": "not_found",
                        "source_page": "not_found",
                        "status": "not_found",
                    },
                    "affected_party": {
                        "text": "Mock Recipients",
                        "evidence_quote": "not_found",
                        "source_page": "not_found",
                        "status": "not_found",
                    },
                    "main_purpose": {
                        "text": "Mock purpose",
                        "evidence_quote": "not_found",
                        "source_page": "not_found",
                        "status": "not_found",
                    },
                    "plain_language_summary": {
                        "what_is_this": "Mock notice explanation",
                        "why_it_matters": "Mock importance",
                        "what_to_do": "Mock instructions",
                        "where_to_do_it": "Mock location",
                        "if_deadline_missed": "Mock consequence",
                    },
                    "deadlines": [],
                    "required_documents": [],
                    "submission_channel": {
                        "channel": None,
                        "evidence_quote": None,
                        "source_page": None,
                        "status": "not_found",
                    },
                    "penalties": [],
                    "action_steps": [],
                    "warnings": [],
                    "needs_verification": False,
                    "document_quality": "good",
                    "extracted_at": "2026-10-23T00:00:00Z",
                }
            )

        resp = self._responses.pop(0) if len(self._responses) > 1 else self._responses[0]

        if isinstance(resp, type) and issubclass(resp, Exception):
            raise resp("FakeLLMClient simulated failure")
        if isinstance(resp, Exception):
            raise resp
        if callable(resp):
            val = resp(system_prompt, user_prompt)
            if isinstance(val, Exception):
                raise val
            logger.info("Model '%s' answered successfully.", self.model)
            return str(val)
        logger.info("Model '%s' answered successfully.", self.model)
        return str(resp)


def get_llm_client(
    provider: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    fallback_model: str | None = None,
) -> BaseLLMClient:
    """Factory creating an LLM client instance based on configuration or environment.

    Args:
        provider: Provider identifier ('gemini' or 'openai'). Defaults to env LLM_PROVIDER.
        api_key: API secret key. Defaults to provider environment variables.
        model: Model name. Defaults to provider standard model.
        fallback_model: Optional fallback model for temporary failures.

    Returns:
        Configured BaseLLMClient instance.
    """
    prov = (provider or os.getenv("LLM_PROVIDER") or "gemini").lower().strip()

    if prov == "gemini":
        return GeminiLLMClient(
            api_key=api_key,
            model=model,
            fallback_model=fallback_model,
        )
    elif prov in ("openai", "azure_openai"):
        return OpenAILLMClient(api_key=api_key, model=model)
    else:
        raise ValueError(
            f"Unsupported LLM_PROVIDER '{prov}'. Supported providers are 'gemini' and 'openai'."
        )
