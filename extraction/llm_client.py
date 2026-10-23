"""LLM client interface and provider implementations for Notice to Action.

Provides a unified BaseLLMClient interface, a real Gemini API client using
structured JSON mode at temperature 0, an OpenAI-compatible client, and a
FakeLLMClient for isolated deterministic tests.
"""

import json
import os
import re
from abc import ABC, abstractmethod
from typing import Any

import httpx


class LLMError(Exception):
    """Exception raised when an LLM provider request fails."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


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

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 60.0,
    ) -> None:
        self.api_key = api_key or os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY")
        self.model = model or os.getenv("LLM_MODEL") or self.DEFAULT_MODEL
        self.timeout = timeout_seconds

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Call Gemini generateContent endpoint with responseMimeType='application/json'."""
        if not self.api_key:
            raise LLMError(
                "Gemini API key is not configured. Please set the LLM_API_KEY or "
                "GEMINI_API_KEY environment variable."
            )

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        )
        headers = {"Content-Type": "application/json"}
        params = {"key": self.api_key}

        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json",
            },
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, headers=headers, params=params, json=payload)

            if response.status_code != 200:
                raise LLMError(
                    f"Gemini API returned status {response.status_code}: {response.text}",
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

        except httpx.RequestError as exc:
            raise LLMError(f"Network error connecting to Gemini API: {exc}") from None


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
        self.api_key = api_key or os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
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
                raise LLMError(
                    f"OpenAI API returned status {response.status_code}: {response.text}",
                    status_code=response.status_code,
                )

            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                raise LLMError("OpenAI API returned no choices.")

            content = choices[0].get("message", {}).get("content", "")
            return clean_json_markdown(content)

        except httpx.RequestError as exc:
            raise LLMError(f"Network error connecting to OpenAI API: {exc}") from None


class FakeLLMClient(BaseLLMClient):
    """Mock LLM client returning canned responses for testing.

    Never makes external API calls. Records all invocations to inspect prompt structure.
    """

    def __init__(
        self,
        responses: list[str | dict[str, Any]] | str | dict[str, Any] | None = None,
    ) -> None:
        self.calls: list[dict[str, str]] = []
        self._responses: list[str] = []

        if responses is not None:
            if isinstance(responses, list):
                for resp in responses:
                    if isinstance(resp, dict):
                        self._responses.append(json.dumps(resp))
                    else:
                        self._responses.append(str(resp))
            elif isinstance(responses, dict):
                self._responses.append(json.dumps(responses))
            else:
                self._responses.append(str(responses))

    def set_responses(self, responses: list[str | dict[str, Any]] | str | dict[str, Any]) -> None:
        """Reset or configure canned responses queue."""
        self._responses = []
        if isinstance(responses, list):
            for resp in responses:
                if isinstance(resp, dict):
                    self._responses.append(json.dumps(resp))
                else:
                    self._responses.append(str(resp))
        elif isinstance(responses, dict):
            self._responses.append(json.dumps(responses))
        else:
            self._responses.append(str(responses))

    @property
    def call_count(self) -> int:
        """Number of calls made to generate_json."""
        return len(self.calls)

    def generate_json(self, system_prompt: str, user_prompt: str) -> str:
        """Record the call and return the next canned response."""
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

        if len(self._responses) == 1:
            return self._responses[0]
        return self._responses.pop(0)


def get_llm_client(
    provider: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> BaseLLMClient:
    """Factory creating an LLM client instance based on configuration or environment.

    Args:
        provider: Provider identifier ('gemini' or 'openai'). Defaults to env LLM_PROVIDER.
        api_key: API secret key. Defaults to provider environment variables.
        model: Model name. Defaults to provider standard model.

    Returns:
        Configured BaseLLMClient instance.
    """
    prov = (provider or os.getenv("LLM_PROVIDER") or "gemini").lower().strip()

    if prov == "gemini":
        return GeminiLLMClient(api_key=api_key, model=model)
    elif prov in ("openai", "azure_openai"):
        return OpenAILLMClient(api_key=api_key, model=model)
    else:
        raise ValueError(
            f"Unsupported LLM_PROVIDER '{prov}'. Supported providers are 'gemini' and 'openai'."
        )
