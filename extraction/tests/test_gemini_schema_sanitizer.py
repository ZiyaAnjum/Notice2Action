"""Unit tests for Gemini schema sanitization.

Verifies that schemas sent to Gemini generateContent API:
1. Have no list-valued "type" (e.g. ["string", "null"]) anywhere in the structure.
2. Have "nullable": True on nullable fields.
3. Have no unsupported keywords (additionalProperties, $defs, $ref, $schema, title, etc.).
4. Flattens anyOf/oneOf containing null branches into a single nullable type.
5. Leaves the original JSON schema completely untouched (no in-place mutations).
6. Is correctly applied by GeminiLLMClient._post_generate_content before dispatching requests.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from extraction.llm_client import GeminiLLMClient
from extraction.llm_extractor import COMPACT_EXTRACTION_SCHEMA
from extraction.schema_sanitizer import (
    UNSUPPORTED_GEMINI_KEYWORDS,
    sanitize_gemini_schema,
)


def _assert_no_list_types_or_unsupported_keywords(obj: Any, path: str = "") -> None:
    """Recursively assert that a schema dict has no list-valued types and no unsupported keys."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            current_path = f"{path}.{k}" if path else k
            assert k not in UNSUPPORTED_GEMINI_KEYWORDS, (
                f"Unsupported keyword '{k}' found at path '{current_path}'"
            )
            assert k not in ("anyOf", "oneOf", "allOf"), (
                f"Unhandled union keyword '{k}' found at path '{current_path}'"
            )
            if k == "type":
                assert isinstance(v, str), (
                    f"Expected 'type' to be a string at '{current_path}', got {type(v)}: {v}"
                )
                assert v in ("string", "number", "integer", "boolean", "array", "object"), (
                    f"Invalid Gemini proto type '{v}' at '{current_path}'"
                )
            _assert_no_list_types_or_unsupported_keywords(v, current_path)
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            _assert_no_list_types_or_unsupported_keywords(item, f"{path}[{idx}]")


def test_sanitize_compact_extraction_schema() -> None:
    """Test that COMPACT_EXTRACTION_SCHEMA is properly converted for Gemini."""
    # Verify pre-condition: original schema has list-valued types
    assert COMPACT_EXTRACTION_SCHEMA["properties"]["amount_due"]["type"] == ["string", "null"]
    deadlines_props = COMPACT_EXTRACTION_SCHEMA["properties"]["deadlines"]["items"]["properties"]
    assert deadlines_props["offset_days"]["type"] == ["integer", "null"]
    assert deadlines_props["relative_to"]["type"] == ["string", "null"]

    sanitized = sanitize_gemini_schema(COMPACT_EXTRACTION_SCHEMA)

    # 1. No list types and no unsupported keywords anywhere
    _assert_no_list_types_or_unsupported_keywords(sanitized)

    # 2. Check specific converted fields
    amount_due = sanitized["properties"]["amount_due"]
    assert amount_due["type"] == "string"
    assert amount_due.get("nullable") is True

    sanitized_deadlines_props = sanitized["properties"]["deadlines"]["items"]["properties"]
    offset_days = sanitized_deadlines_props["offset_days"]
    assert offset_days["type"] == "integer"
    assert offset_days.get("nullable") is True

    relative_to = sanitized_deadlines_props["relative_to"]
    assert relative_to["type"] == "string"
    assert relative_to.get("nullable") is True

    # 3. Check original schema is UNTOUCHED
    assert COMPACT_EXTRACTION_SCHEMA["properties"]["amount_due"]["type"] == ["string", "null"]
    assert deadlines_props["offset_days"]["type"] == ["integer", "null"]
    assert "nullable" not in COMPACT_EXTRACTION_SCHEMA["properties"]["amount_due"]


def test_sanitize_unsupported_keywords_and_formats() -> None:
    """Test removal of unsupported keywords and non-proto formats."""
    raw_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://example.com/test.schema.json",
        "title": "TestDocument",
        "type": "object",
        "additionalProperties": False,
        "default": {},
        "examples": [{"name": "example"}],
        "required": ["email", "created_at"],
        "properties": {
            "email": {
                "type": "string",
                "format": "email",  # unsupported by Gemini proto
                "pattern": r"^[^@]+@[^@]+$",
                "minLength": 5,
                "maxLength": 100,
            },
            "created_at": {
                "type": "string",
                "format": "date-time",  # supported by Gemini proto
            },
            "status": {
                "type": ["string", "null"],
                "default": "pending",
            },
        },
    }

    sanitized = sanitize_gemini_schema(raw_schema)
    _assert_no_list_types_or_unsupported_keywords(sanitized)

    # Unsupported keywords stripped
    for kw in ["$schema", "$id", "title", "additionalProperties", "default", "examples"]:
        assert kw not in sanitized

    email_prop = sanitized["properties"]["email"]
    assert "format" not in email_prop  # "email" format removed
    assert "pattern" not in email_prop
    assert "minLength" not in email_prop
    assert "maxLength" not in email_prop

    # Valid format retained
    created_at_prop = sanitized["properties"]["created_at"]
    assert created_at_prop.get("format") == "date-time"

    # Nullable converted
    status_prop = sanitized["properties"]["status"]
    assert status_prop["type"] == "string"
    assert status_prop.get("nullable") is True
    assert "default" not in status_prop


def test_sanitize_anyof_oneof_nullable_unions() -> None:
    """Test that anyOf/oneOf with null branches are flattened into nullable fields."""
    raw_schema = {
        "type": "object",
        "properties": {
            "note": {
                "anyOf": [
                    {"type": "string"},
                    {"type": "null"},
                ]
            },
            "count": {
                "oneOf": [
                    {"type": "integer"},
                    {"type": "null"},
                ]
            },
        },
    }

    sanitized = sanitize_gemini_schema(raw_schema)
    _assert_no_list_types_or_unsupported_keywords(sanitized)

    assert sanitized["properties"]["note"]["type"] == "string"
    assert sanitized["properties"]["note"].get("nullable") is True
    assert "anyOf" not in sanitized["properties"]["note"]

    assert sanitized["properties"]["count"]["type"] == "integer"
    assert sanitized["properties"]["count"].get("nullable") is True
    assert "oneOf" not in sanitized["properties"]["count"]


def test_gemini_client_sanitizes_schema_before_sending(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify GeminiLLMClient sends the sanitized schema in the HTTP payload."""
    sent_payload: dict[str, Any] = {}

    def mock_post(url: str, headers: dict[str, str], json: dict[str, Any]) -> Any:
        nonlocal sent_payload
        sent_payload = json
        # Return dummy Gemini candidate structure
        class MockResponse:
            status_code = 200

            def json(self) -> dict[str, Any]:
                return {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": '{"notice_type": "tax", "source_organisation": "IRS", "one_line_summary": "Tax due", "summary_plain": "Pay tax", "deadlines": [], "action_steps": []}'
                                    }
                                ]
                            }
                        }
                    ]
                }

        return MockResponse()

    client = GeminiLLMClient(api_key="test-key", model="gemini-1.5-flash")
    # Patch httpx.Client.post
    monkeypatch.setattr("httpx.Client.post", lambda self, url, headers, json: mock_post(url, headers, json))

    # Send COMPACT_EXTRACTION_SCHEMA with list-valued types
    client._post_generate_content(
        "gemini-1.5-flash",
        "system prompt",
        "user prompt",
        response_schema=COMPACT_EXTRACTION_SCHEMA,
    )

    assert "generationConfig" in sent_payload
    sent_schema = sent_payload["generationConfig"].get("responseSchema")
    assert sent_schema is not None

    # Verify the actual schema sent over HTTP has NO list-valued types and NO unsupported keywords
    _assert_no_list_types_or_unsupported_keywords(sent_schema)
    assert sent_schema["properties"]["amount_due"]["type"] == "string"
    assert sent_schema["properties"]["amount_due"]["nullable"] is True
    assert sent_schema["properties"]["deadlines"]["items"]["properties"]["offset_days"]["type"] == "integer"
    assert sent_schema["properties"]["deadlines"]["items"]["properties"]["offset_days"]["nullable"] is True


def test_schema_sent_to_gemini_has_no_list_valued_type(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mocked unit test specifically asserting that the schema sent to Gemini has no list-valued 'type'."""
    intercepted_schema: dict[str, Any] | None = None

    def mock_post(url: str, headers: dict[str, str], json: dict[str, Any]) -> Any:
        nonlocal intercepted_schema
        intercepted_schema = json.get("generationConfig", {}).get("responseSchema")

        class MockResponse:
            status_code = 200

            def json(self) -> dict[str, Any]:
                return {
                    "candidates": [
                        {"content": {"parts": [{"text": "{}"}]}}
                    ]
                }

        return MockResponse()

    monkeypatch.setattr("httpx.Client.post", lambda self, url, headers, json: mock_post(url, headers, json))

    client = GeminiLLMClient(api_key="test-api-key", model="gemini-test-model")
    test_schema = {
        "type": "object",
        "properties": {
            "title": {"type": ["string", "null"]},
            "count": {"type": ["integer", "null"]},
            "tags": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tag_name": {"type": ["string", "null"]},
                    },
                },
            },
        },
    }
    client._post_generate_content("gemini-test-model", "sys", "usr", response_schema=test_schema)

    assert intercepted_schema is not None

    def check_types(node: Any, path: str = "") -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                if k == "type":
                    assert not isinstance(v, (list, tuple)), f"Found list-valued type at {path}: {v}"
                    assert isinstance(v, str), f"Expected string type at {path}, got {type(v)}"
                check_types(v, f"{path}.{k}" if path else k)
        elif isinstance(node, list):
            for i, item in enumerate(node):
                check_types(item, f"{path}[{i}]")

    check_types(intercepted_schema)
    assert intercepted_schema["properties"]["title"]["type"] == "string"
    assert intercepted_schema["properties"]["title"]["nullable"] is True
    assert intercepted_schema["properties"]["count"]["type"] == "integer"
    assert intercepted_schema["properties"]["count"]["nullable"] is True
    assert intercepted_schema["properties"]["tags"]["items"]["properties"]["tag_name"]["type"] == "string"
    assert intercepted_schema["properties"]["tags"]["items"]["properties"]["tag_name"]["nullable"] is True

