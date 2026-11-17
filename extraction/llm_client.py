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
from dotenv import load_dotenv

load_dotenv()

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


DEFAULT_TOTAL_TIME_BUDGET_SEC: float = 60.0

# Documented constant: minimum remaining pipeline budget in seconds required to attempt
# a fallback model. If fewer seconds remain, the fallback attempt is skipped to prevent breaching the budget.
DEFAULT_MIN_FALLBACK_REMAINING_BUDGET_SEC: float = 3.0
MIN_FALLBACK_REMAINING_BUDGET_SEC: float = float(
    os.getenv("MIN_FALLBACK_REMAINING_BUDGET_SEC", str(DEFAULT_MIN_FALLBACK_REMAINING_BUDGET_SEC))
)

_active_pipeline_start_time: float | None = None
_active_pipeline_total_budget: float | None = None


def set_active_pipeline_budget(
    total_budget: float = DEFAULT_TOTAL_TIME_BUDGET_SEC,
    start_time: float | None = None,
) -> None:
    """Set the active pipeline wall-clock time budget and start timestamp globally."""
    global _active_pipeline_start_time, _active_pipeline_total_budget
    _active_pipeline_total_budget = float(total_budget)
    _active_pipeline_start_time = start_time if start_time is not None else time.perf_counter()


def get_active_remaining_budget() -> float:
    """Calculate the globally active remaining pipeline budget in seconds."""
    global _active_pipeline_start_time, _active_pipeline_total_budget
    budget = _active_pipeline_total_budget
    if budget is None:
        env_val = os.getenv("PIPELINE_TOTAL_TIMEOUT_SEC")
        if env_val:
            try:
                budget = float(env_val)
            except ValueError:
                budget = DEFAULT_TOTAL_TIME_BUDGET_SEC
        else:
            budget = DEFAULT_TOTAL_TIME_BUDGET_SEC

    if _active_pipeline_start_time is not None:
        elapsed = time.perf_counter() - _active_pipeline_start_time
        return max(0.0, budget - elapsed)

    return float(budget)


class BaseLLMClient(ABC):
    """Abstract interface for LLM client providers."""

    def __init__(self) -> None:
        self.pipeline_start_time: float | None = None
        self.pipeline_total_budget: float | None = None

    def set_pipeline_budget(
        self,
        total_budget: float,
        start_time: float | None = None,
    ) -> None:
        """Set the active pipeline wall-clock time budget and start timestamp.

        Args:
            total_budget: Total pipeline budget in seconds (e.g. from PIPELINE_TOTAL_TIMEOUT_SEC).
            start_time: Optional start timestamp (perf_counter). Defaults to time.perf_counter().
        """
        self.pipeline_total_budget = float(total_budget)
        self.pipeline_start_time = start_time if start_time is not None else time.perf_counter()

    def get_remaining_budget(self) -> float:
        """Calculate remaining pipeline budget in seconds.

        Returns:
            PIPELINE_TOTAL_TIMEOUT_SEC minus time already spent on OCR, triage, and earlier calls.
            Returns 0.0 if the budget is completely exhausted.
        """
        if self.pipeline_start_time is not None and self.pipeline_total_budget is not None:
            elapsed = time.perf_counter() - self.pipeline_start_time
            return max(0.0, self.pipeline_total_budget - elapsed)

        global _active_pipeline_start_time, _active_pipeline_total_budget
        if _active_pipeline_start_time is not None and _active_pipeline_total_budget is not None:
            elapsed = time.perf_counter() - _active_pipeline_start_time
            return max(0.0, _active_pipeline_total_budget - elapsed)

        env_val = os.getenv("PIPELINE_TOTAL_TIMEOUT_SEC")
        if env_val:
            try:
                return float(env_val)
            except ValueError:
                pass

        return float(getattr(self, "timeout", DEFAULT_TOTAL_TIME_BUDGET_SEC))

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

    def transcribe_image(
        self,
        image_bytes: bytes,
        mime_type: str = "image/png",
        prompt: str | None = None,
    ) -> str:
        """Transcribe verbatim text from an image using vision capabilities.

        Args:
            image_bytes: Raw binary bytes of the rendered page image.
            mime_type: Image MIME type (e.g. 'image/png').
            prompt: Optional transcription guidance prompt.

        Returns:
            Verbatim transcribed text without summaries or interpretations.

        Raises:
            LLMError: If the vision request fails or credentials are missing.
        """
        raise NotImplementedError("Vision transcription is not supported by this provider.")


class GeminiLLMClient(BaseLLMClient):
    """Google Gemini API client using structured JSON output mode at temperature 0."""

    DEFAULT_MODEL = "gemini-1.5-flash"
    DEFAULT_BACKOFF_DELAYS = (2.0, 5.0, 10.0)
    DEFAULT_VISION_PROMPT = (
        "Transcribe the complete, verbatim text of this official notice page image exactly as written. "
        "Do not summarize, explain, or interpret. Output only the verbatim extracted text."
    )

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
        super().__init__()
        self.sleep_fn = sleep_fn or time.sleep
        self.transport = transport

    def _post_generate_content(
        self,
        target_model: str,
        system_prompt: str,
        user_prompt: str,
        timeout: float | None = None,
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

        call_timeout = timeout if timeout is not None else self.timeout
        with httpx.Client(timeout=call_timeout, transport=self.transport) as client:
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

    def _post_generate_vision_content(
        self,
        target_model: str,
        image_bytes: bytes,
        mime_type: str,
        prompt: str,
        timeout: float | None = None,
    ) -> str:
        """Execute single generateContent HTTP request sending image to Gemini vision model."""
        import base64

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

        b64_img = base64.b64encode(image_bytes).decode("ascii")

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_img,
                            }
                        },
                        {"text": prompt},
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.0,
            },
        }

        call_timeout = timeout if timeout is not None else self.timeout
        with httpx.Client(timeout=call_timeout, transport=self.transport) as client:
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
            raise LLMError("Gemini API returned no candidates in the vision response.")

        first_candidate = candidates[0]
        parts = first_candidate.get("content", {}).get("parts", [])
        if not parts:
            return ""

        raw_text = parts[0].get("text", "")
        return raw_text.strip()

    def _execute_with_retry(self, operation: Callable[[str, float], str]) -> str:
        """Execute an operation against Gemini with exponential backoff, budget enforcement, and optional fallback model."""
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
            # 1. Stop retry loop when remaining pipeline budget is exhausted
            rem_budget = self.get_remaining_budget()
            if rem_budget <= 0.0:
                logger.warning(
                    "Pipeline total time budget exhausted before attempt %d/%d on model '%s'. Stopping retry loop.",
                    attempt + 1,
                    max_attempts,
                    self.model,
                )
                raise LLMError(
                    f"Pipeline time budget exhausted: {last_err_msg or 'No budget remaining'}",
                    status_code=last_status_code,
                    is_timeout=True,
                    retries_exhausted=True,
                )

            # 2. Cap each call's timeout to the remaining budget
            call_timeout = min(self.timeout, rem_budget)

            try:
                res = operation(self.model, call_timeout)
                logger.info("Model '%s' answered successfully.", self.model)
                return res
            except httpx.TimeoutException as exc:
                last_is_timeout = True
                last_status_code = None
                safe_err = sanitize_message(str(exc), self.api_key)
                last_err_msg = f"Network timeout: {safe_err}"
                logger.warning(
                    "Gemini request timed out on model '%s' (attempt %d/%d, timeout=%.2fs): %s",
                    self.model,
                    attempt + 1,
                    max_attempts,
                    call_timeout,
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
                        rem_fb = self.get_remaining_budget()
                        if rem_fb < MIN_FALLBACK_REMAINING_BUDGET_SEC:
                            logger.warning(
                                "Remaining budget %.2fs < threshold %.2fs. Skipping fallback model '%s' after 404.",
                                rem_fb,
                                MIN_FALLBACK_REMAINING_BUDGET_SEC,
                                fallback,
                            )
                            raise LLMError(
                                f"Primary model '{self.model}' returned 404 and insufficient remaining budget ({rem_fb:.2f}s < {MIN_FALLBACK_REMAINING_BUDGET_SEC:.1f}s) for fallback: {safe_err}",
                                status_code=404,
                                is_timeout=True,
                                retries_exhausted=True,
                            ) from None

                        fb_timeout = min(self.timeout, rem_fb)
                        logger.warning(
                            "Primary model '%s' returned 404. Trying fallback model '%s' with timeout %.2fs...",
                            self.model,
                            fallback,
                            fb_timeout,
                        )
                        try:
                            res = operation(fallback, fb_timeout)
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

            # Stop retry loop if remaining pipeline budget is exhausted after call
            rem_after_call = self.get_remaining_budget()
            if rem_after_call <= 0.0:
                logger.warning(
                    "Pipeline total time budget exhausted after attempt %d/%d. Stopping retry loop.",
                    attempt + 1,
                    max_attempts,
                )
                raise LLMError(
                    f"Pipeline time budget exhausted after attempt {attempt + 1}: {last_err_msg}",
                    status_code=last_status_code,
                    is_timeout=True,
                    retries_exhausted=True,
                )

            # If retryable and retries remain, back off with random jitter
            if attempt < len(delays):
                base_delay = delays[attempt]
                jitter = random.uniform(0.1, 0.5)
                sleep_duration = base_delay + jitter
                if sleep_duration >= rem_after_call:
                    logger.warning(
                        "Backoff delay %.2fs exceeds remaining budget %.2fs. Stopping retry loop.",
                        sleep_duration,
                        rem_after_call,
                    )
                    raise LLMError(
                        f"Pipeline time budget exhausted during backoff delay: {last_err_msg}",
                        status_code=last_status_code,
                        is_timeout=True,
                        retries_exhausted=True,
                    )
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
            rem_for_fallback = self.get_remaining_budget()
            # Do not start a fallback-model attempt if less than documented constant threshold remains
            if rem_for_fallback < MIN_FALLBACK_REMAINING_BUDGET_SEC:
                logger.warning(
                    "Remaining pipeline budget (%.2fs) is less than threshold %.2fs. Skipping fallback model '%s'.",
                    rem_for_fallback,
                    MIN_FALLBACK_REMAINING_BUDGET_SEC,
                    fallback,
                )
                raise LLMError(
                    f"Gemini API request failed after retries and insufficient remaining budget ({rem_for_fallback:.2f}s < {MIN_FALLBACK_REMAINING_BUDGET_SEC:.1f}s) for fallback model: {last_err_msg}",
                    status_code=last_status_code,
                    is_timeout=last_is_timeout,
                    retries_exhausted=True,
                )

            fb_timeout = min(self.timeout, rem_for_fallback)
            logger.info("Attempting fallback model '%s' once with timeout %.2fs...", fallback, fb_timeout)
            try:
                res = operation(fallback, fb_timeout)
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

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Call Gemini generateContent with exponential backoff, budget enforcement, and optional fallback model."""
        return self._execute_with_retry(
            lambda model, call_timeout: self._post_generate_content(
                model, system_prompt, user_prompt, timeout=call_timeout
            )
        )

    def transcribe_image(
        self,
        image_bytes: bytes,
        mime_type: str = "image/png",
        prompt: str | None = None,
    ) -> str:
        """Transcribe verbatim text from an image with exponential backoff, budget enforcement, and optional fallback model."""
        target_prompt = prompt or self.DEFAULT_VISION_PROMPT
        return self._execute_with_retry(
            lambda model, call_timeout: self._post_generate_vision_content(
                model, image_bytes, mime_type, target_prompt, timeout=call_timeout
            )
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
        super().__init__()
        self.api_key = (
            api_key
            if api_key is not None
            else (os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"))
        )
        self.model = model or os.getenv("LLM_MODEL") or self.DEFAULT_MODEL
        self.base_url = os.getenv("OPENAI_BASE_URL", base_url).rstrip("/")
        self.timeout = timeout_seconds

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Call OpenAI chat completions endpoint in JSON mode with budget enforcement."""
        if not self.api_key:
            raise LLMError(
                "OpenAI API key is not configured. Please set the LLM_API_KEY or "
                "OPENAI_API_KEY environment variable."
            )

        rem_budget = self.get_remaining_budget()
        if rem_budget <= 0.0:
            raise LLMError(
                "Pipeline time budget exhausted.",
                is_timeout=True,
                retries_exhausted=True,
            )

        call_timeout = min(self.timeout, rem_budget)
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
            with httpx.Client(timeout=call_timeout) as client:
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
        vision_responses: list[Any] | Any | None = None,
        timeout_seconds: float = 60.0,
        always_timeout: bool = False,
        timeout_delay: float | None = None,
    ) -> None:
        super().__init__()
        self.model = model
        self.timeout = timeout_seconds
        self.always_timeout = always_timeout
        self.timeout_delay = timeout_delay
        self.calls: list[dict[str, str]] = []
        self.vision_calls: list[dict[str, Any]] = []
        self._responses: list[Any] = []
        self._vision_responses: list[Any] = []

        if responses is not None:
            self.set_responses(responses)
        if vision_responses is not None:
            self.set_vision_responses(vision_responses)

    def set_vision_responses(self, responses: list[Any] | Any) -> None:
        """Reset or configure canned vision OCR responses queue."""
        self._vision_responses = []
        if isinstance(responses, list):
            self._vision_responses.extend(responses)
        else:
            self._vision_responses.append(responses)

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

        if self.always_timeout:
            remaining = self.get_remaining_budget()
            if self.timeout_delay is not None:
                delay = min(self.timeout_delay, remaining) if remaining > 0 else 0.0
            else:
                delay = min(self.timeout, remaining) if remaining > 0 else 0.0
            if delay > 0:
                time.sleep(delay)
            rem_after = self.get_remaining_budget()
            raise LLMError(
                f"FakeLLMClient simulated network timeout (slept {delay:.2f}s, remaining={rem_after:.2f}s)",
                is_timeout=True,
                retries_exhausted=(rem_after <= 0.0),
            )

        is_triage = "triage" in system_prompt.lower()

        if not self._responses:
            if is_triage:
                return json.dumps(
                    {
                        "is_actionable_notice": True,
                        "category": "scholarship_or_college",
                        "confidence": 0.95,
                        "reason": "Default mock triage response",
                    }
                )
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

        # If triage call but the queued response is clearly an extraction response,
        # synthesize a triage response and preserve the extraction response for the next call.
        if is_triage and self._responses:
            candidate = self._responses[0]
            if (
                isinstance(candidate, str)
                and ("plain_language_summary" in candidate or "notice_title" in candidate)
                and "is_actionable_notice" not in candidate
            ):
                try:
                    cand_obj = json.loads(candidate)
                    cat = cand_obj.get("category", "scholarship_or_college")
                except Exception:
                    cat = "scholarship_or_college"
                is_act = cat not in ("other_out_of_scope", "not_a_notice")
                t_cat = "not_a_notice" if not is_act else cat
                return json.dumps(
                    {
                        "is_actionable_notice": is_act,
                        "category": t_cat,
                        "confidence": 0.95,
                        "reason": "Synthesized mock triage from extraction response",
                    }
                )
            elif (
                isinstance(candidate, dict)
                and ("plain_language_summary" in candidate or "notice_title" in candidate)
                and "is_actionable_notice" not in candidate
            ):
                cat = candidate.get("category", "scholarship_or_college")
                is_act = cat not in ("other_out_of_scope", "not_a_notice")
                t_cat = "not_a_notice" if not is_act else cat
                return json.dumps(
                    {
                        "is_actionable_notice": is_act,
                        "category": t_cat,
                        "confidence": 0.95,
                        "reason": "Synthesized mock triage from extraction response",
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

    def transcribe_image(
        self,
        image_bytes: bytes,
        mime_type: str = "image/png",
        prompt: str | None = None,
    ) -> str:
        """Mock transcription response for vision OCR."""
        self.vision_calls.append({"mime_type": mime_type, "prompt": prompt, "size": len(image_bytes)})
        self.calls.append({"system_prompt": "vision_transcription", "user_prompt": prompt or ""})

        if self.always_timeout:
            remaining = self.get_remaining_budget()
            if self.timeout_delay is not None:
                delay = min(self.timeout_delay, remaining) if remaining > 0 else 0.0
            else:
                delay = min(self.timeout, remaining) if remaining > 0 else 0.0
            if delay > 0:
                time.sleep(delay)
            rem_after = self.get_remaining_budget()
            raise LLMError(
                f"FakeLLMClient simulated vision timeout (slept {delay:.2f}s, remaining={rem_after:.2f}s)",
                is_timeout=True,
                retries_exhausted=(rem_after <= 0.0),
            )

        if not self._vision_responses:
            return "Mock verbatim text extracted from scanned notice page."

        resp = (
            self._vision_responses.pop(0)
            if len(self._vision_responses) > 1
            else self._vision_responses[0]
        )
        if isinstance(resp, type) and issubclass(resp, Exception):
            raise resp("FakeLLMClient simulated vision failure")
        if isinstance(resp, Exception):
            raise resp
        if callable(resp):
            val = resp(image_bytes, mime_type, prompt)
            if isinstance(val, Exception):
                raise val
            return str(val)
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
