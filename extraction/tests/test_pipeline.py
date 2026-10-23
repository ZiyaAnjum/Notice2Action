"""End-to-end pipeline integration tests using FakeLLMClient.

Tests:
1. Valid canned output successfully passes the pipeline.
2. Hallucinated quote not in the notice is flagged as uncertain with warnings.
3. Invalid JSON is repaired on retry; repeated failure returns structured failure.
4. Unreadable PDF and out-of-scope PDF refuse early WITHOUT calling LLM.
5. Missing deadline results in 'not_found', never an invented date.
"""

import copy
import json
from pathlib import Path
from typing import Any

from extraction.llm_client import FakeLLMClient
from extraction.pipeline import process_notice

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"
SAMPLES_DIR = Path(__file__).resolve().parent.parent.parent / "samples"


def get_base_scholarship_canned_data() -> dict[str, Any]:
    """Load canonical scholarship sample notice for canned responses."""
    sample_file = SAMPLES_DIR / "scholarship_renewal_notice.json"
    with open(sample_file, encoding="utf-8") as f:
        data = json.load(f)
    return data


def test_pipeline_valid_canned_output() -> None:
    """Verify that a valid, grounded canned LLM output passes the pipeline."""
    canned_data = get_base_scholarship_canned_data()
    fake_client = FakeLLMClient(canned_data)

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["category"] == "scholarship_or_college"
    assert res["result"] is not None
    assert fake_client.call_count == 1
    assert res["result"]["notice_id"] == "notice-sch-2026-001"
    assert res["result"]["notice_title"]["status"] == "found"


def test_pipeline_hallucinated_quote_flagged() -> None:
    """Verify that quotes not found in the notice text are marked uncertain and warn."""
    canned_data = get_base_scholarship_canned_data()

    # Inject an ungrounded hallucinated quote into deadline and required document
    canned_data["deadlines"][0]["evidence_quote"] = "Non-existent fabricated deadline clause 999"
    canned_data["required_documents"][0]["evidence_quote"] = (
        "Imaginary document mandate section 888"
    )

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True

    result_notice = res["result"]
    assert result_notice is not None

    # Status must be converted to uncertain
    assert result_notice["deadlines"][0]["status"] == "uncertain"
    assert result_notice["required_documents"][0]["status"] == "uncertain"

    # Warning must be recorded
    warnings = result_notice.get("warnings") or []
    assert any("Grounding warning" in w.get("warning_text", "") for w in warnings)


def test_pipeline_retry_and_repair() -> None:
    """Verify that invalid JSON on attempt 1 is self-repaired on attempt 2."""
    canned_data = get_base_scholarship_canned_data()

    # Sequence: First attempt returns invalid syntax, second returns valid JSON
    responses = [
        "{ malformed json syntax: missing quotes and braces",
        canned_data,
    ]
    fake_client = FakeLLMClient(responses)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert fake_client.call_count == 2
    assert res["result"] is not None
    assert res["result"]["category"] == "scholarship_or_college"


def test_pipeline_repeated_failure_returns_structured_failure() -> None:
    """Verify that repeated invalid outputs return structured failure without raising exception."""
    broken_responses = [
        "{ invalid json 1",
        "{ invalid json 2",
        "{ invalid json 3",
    ]
    fake_client = FakeLLMClient(broken_responses)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    # Must NOT crash with unhandled exception
    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "extraction_failed"
    assert res["result"] is None
    assert res["needs_verification"] is True
    assert "Schema validation failed" in res.get("message", "") or "failed" in res.get(
        "message", ""
    )


def test_pipeline_unreadable_refusal_without_llm() -> None:
    """Verify scanned/unreadable PDF is refused without calling the LLM."""
    fake_client = FakeLLMClient(["{}"])
    pdf_path = FIXTURES_DIR / "scanned_image_only.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "needs_clearer_document"
    assert res["result"] is None
    # Crucial assertion: LLM client was never called!
    assert fake_client.call_count == 0


def test_pipeline_out_of_scope_refusal_without_llm() -> None:
    """Verify out-of-scope document (recipe) is refused without calling the LLM."""
    fake_client = FakeLLMClient(["{}"])
    pdf_path = FIXTURES_DIR / "recipe_unrelated.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "out_of_scope"
    assert res["result"] is None
    # Crucial assertion: LLM client was never called!
    assert fake_client.call_count == 0


def test_pipeline_missing_deadline_is_not_found() -> None:
    """Verify missing deadline in notice results in 'not_found', not an invented date."""
    canned_data = copy.deepcopy(get_base_scholarship_canned_data())
    canned_data["deadlines"] = [
        {
            "date": "not_found",
            "description": "not_found",
            "evidence_quote": "not_found",
            "source_page": "not_found",
            "confidence": "not_found",
            "is_ambiguous_or_conflicting": False,
            "ambiguity_reason": None,
            "status": "not_found",
        }
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    result_notice = res["result"]
    assert result_notice is not None
    assert result_notice["deadlines"][0]["date"] == "not_found"
    assert result_notice["deadlines"][0]["status"] == "not_found"
