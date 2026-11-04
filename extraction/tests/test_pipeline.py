"""End-to-end pipeline integration tests using FakeLLMClient.

Tests:
1. Valid canned output successfully passes the pipeline.
2. Hallucinated quote not in the notice is flagged as uncertain with warnings.
3. Invalid JSON is repaired on retry; repeated failure returns structured failure.
4. Unreadable PDF and out-of-scope PDF refuse early WITHOUT calling LLM.
5. Missing deadline results in 'not_found', never an invented date.
6. Temporary LLM error (503 / 429 / timeout) retry succeeds with FakeLLMClient.
7. Temporary LLM error retry exhaustion returns friendly plain-language busy message.
8. Non-retryable error (400, 401, 403, 404) does not retry.
9. Common date format parsing ("18 November 2026", "18 Nov 2026", "November 18, 2026",
   "18th November 2026", DD/MM/YYYY, DD-MM-YYYY).
10. Two different absolute dates produce conflict reason naming both dates and purposes.
11. Real relative date ("within 7 days of the due date") retains relative reason.
12. Status message differentiation based on needs_verification flag.
13. Penalties with no stated amount use "not_found" rather than None.
"""

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from extraction.llm_client import FRIENDLY_BUSY_MESSAGE, FakeLLMClient, LLMError
from extraction.llm_extractor import PROMPT_VERSION, build_system_prompt
from extraction.pipeline import parse_date_string, process_notice

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
    assert (
        res["message"]
        == "Notice processed. Please check the highlighted items against your original notice."
    )

    result_notice = res["result"]
    assert result_notice is not None

    # Status must be converted to uncertain
    assert result_notice["deadlines"][0]["status"] == "uncertain"
    assert result_notice["required_documents"][0]["status"] == "uncertain"

    # Technical grounding note must be recorded in technical_notes, not in warnings
    tech_notes = result_notice.get("technical_notes") or []
    assert any("Grounding warning" in n.get("warning_text", "") for n in tech_notes)
    user_warnings = result_notice.get("warnings") or []
    assert not any("Grounding warning" in w.get("warning_text", "") for w in user_warnings)


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


def test_pipeline_retry_success_with_fake_llm() -> None:
    """Verify temporary 503 high demand error on attempt 1 succeeds after retry on attempt 2."""
    canned_data = get_base_scholarship_canned_data()
    fake_client = FakeLLMClient(
        [
            LLMError("HTTP 503: The model is overloaded. Please try again later.", status_code=503),
            canned_data,
        ]
    )
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert fake_client.call_count == 2
    assert res["result"] is not None
    assert res["result"]["notice_id"] == "notice-sch-2026-001"


def test_pipeline_timeout_retry_success_with_fake_llm() -> None:
    """Verify network timeout on attempt 1 succeeds after retry on attempt 2."""
    canned_data = get_base_scholarship_canned_data()
    fake_client = FakeLLMClient(
        [
            LLMError("Network timeout connecting to Gemini API", is_timeout=True),
            canned_data,
        ]
    )
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert fake_client.call_count == 2
    assert res["result"] is not None


def test_pipeline_retry_exhaustion_friendly_message_with_fake_llm() -> None:
    """Verify temporary errors across all retry attempts return a friendly busy message.

    Technical detail is logged, but not presented in the user-facing message.
    """
    fake_client = FakeLLMClient(
        [
            LLMError("HTTP 429: Resource has been exhausted (quota exceeded)", status_code=429),
            LLMError("HTTP 429: Resource has been exhausted (quota exceeded)", status_code=429),
            LLMError("HTTP 429: Resource has been exhausted (quota exceeded)", status_code=429),
        ]
    )
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "extraction_failed"
    assert res["result"] is None
    assert res["needs_verification"] is True
    # User message must be friendly plain language
    assert res["message"] == FRIENDLY_BUSY_MESSAGE
    assert "The AI service is busy right now" in res["message"]
    # Technical detail must NOT be shown to users in message
    assert "429" not in res["message"]
    assert "quota exceeded" not in res["message"]


@pytest.mark.parametrize("status_code", [400, 401, 403, 404])
def test_pipeline_non_retryable_errors_no_retry(status_code: int) -> None:
    """Verify non-retryable 400, 401, 403, 404 errors fail immediately with no retry."""
    fake_client = FakeLLMClient(
        [LLMError(f"HTTP {status_code} client error", status_code=status_code)]
    )
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "extraction_failed"
    assert res["result"] is None
    # Crucial assertion: exactly 1 call was made; no retries attempted!
    assert fake_client.call_count == 1
    # Friendly busy message is NOT shown for non-temporary errors
    assert res["message"] != FRIENDLY_BUSY_MESSAGE


# =========================================================================
# Live Smoke Test Fixes Tests (Date Parsing, Conflicts, Status, Penalties)
# =========================================================================


@pytest.mark.parametrize(
    ("raw_input", "expected_iso"),
    [
        ("18 November 2026", "2026-11-18"),
        ("20 November 2026", "2026-11-20"),
        ("18 Nov 2026", "2026-11-18"),
        ("November 18, 2026", "2026-11-18"),
        ("18th November 2026", "2026-11-18"),
        ("18/11/2026", "2026-11-18"),
        ("18-11-2026", "2026-11-18"),
        ("1st December 2026", "2026-12-01"),
        ("2nd January 2026", "2026-01-02"),
        ("3rd March 2026", "2026-03-03"),
    ],
)
def test_parse_date_string_common_formats(raw_input: str, expected_iso: str) -> None:
    """Verify parse_date_string handles all common absolute date formats properly."""
    is_cal, is_rel, iso_str = parse_date_string(raw_input)
    assert is_cal is True
    assert is_rel is False
    assert iso_str == expected_iso


def test_pipeline_date_format_parsed_in_notice() -> None:
    """Verify an absolute date with ordinal suffix '18th November 2026' is parsed without parse failure."""
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"
    canned_data["deadlines"][0]["date"] = "18th November 2026"
    canned_data["deadlines"][0]["evidence_quote"] = grounded_quote
    canned_data["deadlines"][0]["source_page"] = 1

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    dl = res["result"]["deadlines"][0]
    # Successfully parsed and normalized
    assert dl["date"] == "2026-11-18"
    assert dl["is_ambiguous_or_conflicting"] is False
    assert dl["status"] == "found"


def test_pipeline_two_different_absolute_dates_conflict_reason() -> None:
    """Verify two different absolute dates produce a conflict reason naming both dates and what each is for."""
    canned_data = get_base_scholarship_canned_data()
    # Provide grounded quote from document page 1: "State Higher Education Directorate, Scholarship Cell"
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"
    canned_data["deadlines"] = [
        {
            "date": "18 November 2026",
            "description": "Last date for payment without surcharge",
            "role": "primary",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "confidence": 0.95,
            "is_ambiguous_or_conflicting": False,
            "ambiguity_reason": None,
            "status": "found",
        },
        {
            "date": "20 November 2026",
            "description": "Bill due date",
            "role": "primary",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "confidence": 0.95,
            "is_ambiguous_or_conflicting": False,
            "ambiguity_reason": None,
            "status": "found",
        },
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True
    assert (
        res["message"]
        == "Notice processed. Please check the highlighted items against your original notice."
    )

    deadlines = res["result"]["deadlines"]
    assert len(deadlines) == 2

    for dl in deadlines:
        assert dl["is_ambiguous_or_conflicting"] is True
        assert dl["status"] == "conflicting"
        reason = dl["ambiguity_reason"]
        assert reason is not None
        assert "The notice gives two different dates" in reason
        assert "Please check which one applies to you" in reason
        # Must name both dates
        assert "2026-11-18" in reason
        assert "2026-11-20" in reason
        # Must name what each is for
        assert "Last date for payment without surcharge" in reason
        assert "Bill due date" in reason
        # Must NOT be a parse-failure reason
        assert "could not be parsed" not in reason.lower()
        assert "non-standard" not in reason.lower()


def test_pipeline_real_relative_date_retains_relative_reason() -> None:
    """Verify a genuinely relative date ('within 7 days of the due date') retains the relative reason."""
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"
    canned_data["deadlines"] = [
        {
            "date": "within 7 days of the due date",
            "description": "Disconnection notice",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "confidence": 0.90,
            "is_ambiguous_or_conflicting": True,
            "ambiguity_reason": None,
            "status": "ambiguous",
        }
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True

    dl = res["result"]["deadlines"][0]
    assert dl["is_ambiguous_or_conflicting"] is True
    assert dl["status"] == "uncertain"
    assert "relative" in dl["ambiguity_reason"].lower()
    assert "could not be parsed" not in dl["ambiguity_reason"].lower()


def test_pipeline_status_messages_verification_true_and_false() -> None:
    """Verify distinct pipeline success messages when needs_verification is True vs False."""
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    # Case 1: needs_verification is False
    canned_clean = get_base_scholarship_canned_data()
    canned_clean["warnings"] = []
    canned_clean["needs_verification"] = False
    for k in ["notice_title", "issuing_organisation", "affected_party", "main_purpose"]:
        canned_clean[k]["evidence_quote"] = grounded_quote
        canned_clean[k]["source_page"] = 1
    canned_clean["submission_channel"]["evidence_quote"] = grounded_quote
    canned_clean["submission_channel"]["source_page"] = 1
    canned_clean["deadlines"] = [
        {
            "date": "2026-11-18",
            "description": "Submission",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "confidence": 0.95,
            "is_ambiguous_or_conflicting": False,
            "ambiguity_reason": None,
            "status": "found",
        }
    ]
    canned_clean["required_documents"] = []
    canned_clean["action_steps"] = []
    canned_clean["penalties"] = []

    fake_client_clean = FakeLLMClient(canned_clean)
    res_clean = process_notice(pdf_path, client=fake_client_clean)
    assert res_clean["status"] == "success"
    assert res_clean["needs_verification"] is False
    assert res_clean["message"] == "Notice processed and verified successfully."

    # Case 2: needs_verification is True (due to relative deadline)
    canned_unverified = copy.deepcopy(canned_clean)
    canned_unverified["deadlines"] = [
        {
            "date": "within 10 days of notice receipt",
            "description": "Relative window",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "confidence": 0.95,
            "is_ambiguous_or_conflicting": True,
            "ambiguity_reason": None,
            "status": "ambiguous",
        }
    ]
    fake_client_unverified = FakeLLMClient(canned_unverified)

    res_unverified = process_notice(pdf_path, client=fake_client_unverified)
    assert res_unverified["status"] == "success"
    assert res_unverified["needs_verification"] is True
    assert (
        res_unverified["message"]
        == "Notice processed. Please check the highlighted items against your original notice."
    )


def test_pipeline_penalty_amount_not_found() -> None:
    """Verify a penalty with no stated amount uses 'not_found' for amount, never None."""
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"
    canned_data["penalties"] = [
        {
            "description": "Supply disconnection if bill remains unpaid",
            "amount": None,  # Stated as None by LLM candidate
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "status": "found",
        }
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    penalties = res["result"]["penalties"]
    assert len(penalties) == 1
    # Amount must be normalized to "not_found", never None
    assert penalties[0]["amount"] == "not_found"
    assert penalties[0]["amount"] is not None


def test_pipeline_summary_objects_normalized_to_plain_strings_and_evidence_separated() -> None:
    """Verify that if LLM returns summary parts as objects {text, evidence_quote, source_page},
    the pipeline normalizes each part to a plain string and stores evidence in plain_language_summary_evidence.
    """
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    canned_data["plain_language_summary"] = {
        "what_is_this": {
            "text": "Electricity disconnection notice",
            "evidence_quote": grounded_quote,
            "source_page": 1,
        },
        "why_it_matters": {
            "text": "Electricity supply will be disconnected",
            "evidence_quote": grounded_quote,
            "source_page": 1,
        },
        "what_to_do": {
            "text": "Pay outstanding bill immediately",
            "evidence_quote": grounded_quote,
            "source_page": 1,
        },
        "where_to_do_it": {
            "text": "Online portal or local bill counter",
            "evidence_quote": grounded_quote,
            "source_page": 1,
        },
        "if_deadline_missed": {
            "text": "Reconnection fee of Rs. 500 will apply",
            "evidence_quote": grounded_quote,
            "source_page": 1,
        },
    }

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    summary = res["result"]["plain_language_summary"]

    for key, expected_text in [
        ("what_is_this", "Electricity disconnection notice"),
        ("why_it_matters", "Electricity supply will be disconnected"),
        ("what_to_do", "Pay outstanding bill immediately"),
        ("where_to_do_it", "Online portal or local bill counter"),
        ("if_deadline_missed", "Reconnection fee of Rs. 500 will apply"),
    ]:
        val = summary[key]
        assert isinstance(val, str), f"{key} was expected to be str, got {type(val)}"
        assert val == expected_text

    evidence = res["result"].get("plain_language_summary_evidence")
    assert evidence is not None
    assert evidence["what_is_this"]["evidence_quote"] == grounded_quote
    assert evidence["what_is_this"]["source_page"] == 1


def test_pipeline_evidence_quote_with_ellipsis_treated_as_ungrounded() -> None:
    """Verify evidence_quote containing ellipsis '...' is treated as ungrounded."""
    canned_data = get_base_scholarship_canned_data()
    canned_data["notice_title"]["evidence_quote"] = "State Higher Education...Scholarship Cell"
    canned_data["notice_title"]["source_page"] = 1
    canned_data["notice_title"]["status"] = "found"

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True
    assert res["result"]["notice_title"]["status"] == "uncertain"

    tech_notes = res["result"]["technical_notes"]
    assert any(n.get("code") == "GROUNDING_ELLIPSIS_QUOTE" for n in tech_notes)
    user_warnings = res["result"].get("warnings") or []
    assert not any(w.get("code") == "GROUNDING_ELLIPSIS_QUOTE" for w in user_warnings)


def test_pipeline_relative_consequence_deadline_preserved_with_original_wording() -> None:
    """Verify consequence date stated relative to another date ('within 7 days of the due date')
    appears in the deadlines list with original wording as date text, status uncertain,
    and is_ambiguous_or_conflicting true with a reason, and is NOT dropped in favour of a warning.
    """
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    canned_data["deadlines"] = [
        {
            "date": "within 7 days of the due date",
            "description": "Electricity power supply disconnection",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "confidence": 0.90,
            "is_ambiguous_or_conflicting": True,
            "ambiguity_reason": "Relative to bill due date",
            "status": "uncertain",
        }
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True

    deadlines = res["result"]["deadlines"]
    assert len(deadlines) == 1
    dl = deadlines[0]
    assert dl["date"] == "within 7 days of the due date"
    assert dl["status"] == "uncertain"
    assert dl["is_ambiguous_or_conflicting"] is True
    assert dl["ambiguity_reason"] is not None
    assert (
        "relative" in dl["ambiguity_reason"].lower() or "due date" in dl["ambiguity_reason"].lower()
    )


def test_pipeline_penalty_amounts_preserved_with_currency_and_units() -> None:
    """Verify penalty amounts are preserved exactly as written including currency and units."""
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    canned_data["penalties"] = [
        {
            "description": "Late payment surcharge",
            "amount": "2 percent per month",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "status": "found",
        },
        {
            "description": "Reconnection fee",
            "amount": "Rs. 500",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "status": "found",
        },
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    penalties = res["result"]["penalties"]
    assert len(penalties) == 2
    assert penalties[0]["amount"] == "2 percent per month"
    assert penalties[1]["amount"] == "Rs. 500"


def test_pipeline_staged_deadlines_not_a_conflict() -> None:
    """Verify that staged deadlines (primary + extended) are not flagged as conflicting."""
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    canned_data["deadlines"] = [
        {
            "description": "Online application submission",
            "date": "2026-11-30",
            "role": "primary",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "confidence": 0.95,
            "is_ambiguous_or_conflicting": False,
            "ambiguity_reason": None,
            "status": "found",
        },
        {
            "description": "Submission with late fee of Rs. 100",
            "date": "2026-12-15",
            "role": "extended",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "confidence": 0.90,
            "is_ambiguous_or_conflicting": False,
            "ambiguity_reason": None,
            "status": "found",
        },
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    deadlines = res["result"]["deadlines"]
    assert len(deadlines) == 2

    # Primary deadline must NOT be marked conflicting
    assert deadlines[0]["role"] == "primary"
    assert deadlines[0]["is_ambiguous_or_conflicting"] is False
    assert deadlines[0]["status"] == "found"

    # Extended deadline must NOT be marked conflicting
    assert deadlines[1]["role"] == "extended"
    assert deadlines[1]["is_ambiguous_or_conflicting"] is False
    assert deadlines[1]["status"] == "found"

    # No conflict diagnostic should be emitted
    tech_notes = res["result"]["technical_notes"]
    assert not any(n.get("code") == "DEADLINE_CONFLICTING_DATES" for n in tech_notes)
    warnings = res["result"].get("warnings") or []
    assert not any(w.get("code") == "DEADLINE_CONFLICTING_DATES" for w in warnings)


def test_pipeline_required_documents_conditional_items_moved_to_warnings() -> None:
    """Verify that required_documents items with conditional phrasing ('if you', 'instead', 'may')
    are moved to warnings for review and removed from required_documents.
    """
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    canned_data["required_documents"] = [
        {
            "name": "Income Certificate",
            "is_required": True,
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "status": "not_completed",
        },
        {
            "name": "Payment Receipt",
            "is_required": True,
            "evidence_quote": "If you have already paid, send the receipt",
            "source_page": 1,
            "status": "not_completed",
        },
        {
            "name": "Self-Declaration",
            "is_required": True,
            "evidence_quote": "Candidates may submit a self-declaration instead",
            "source_page": 1,
            "status": "not_completed",
        },
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True

    # Only genuine required document must remain
    docs = res["result"]["required_documents"]
    assert len(docs) == 1
    assert docs[0]["name"] == "Income Certificate"

    # Conditional and alternative items must be moved to technical_notes
    doc_notes = [
        n
        for n in res["result"]["technical_notes"]
        if n.get("code") == "DOCUMENT_CONDITIONAL_OR_ALTERNATIVE"
    ]
    assert len(doc_notes) == 2
    note_texts = " ".join(n["note"] for n in doc_notes)
    assert "Payment Receipt" in note_texts
    assert "Self-Declaration" in note_texts
    user_warnings = res["result"].get("warnings") or []
    assert not any(w.get("code") == "DOCUMENT_CONDITIONAL_OR_ALTERNATIVE" for w in user_warnings)


def test_pipeline_no_deadlines_summary_if_deadline_missed() -> None:
    """Verify that when the notice states no deadline, if_deadline_missed summary says
    'The notice does not give a deadline.' and does not reuse penalty text.
    """
    canned_data = get_base_scholarship_canned_data()
    # No deadlines stated in notice
    canned_data["deadlines"] = []
    # LLM hallucinated penalty text into if_deadline_missed
    canned_data["plain_language_summary"]["if_deadline_missed"] = (
        "Disconnection penalty of Rs. 500 and 2 percent late surcharge will be charged."
    )

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    summary = res["result"]["plain_language_summary"]
    assert summary["if_deadline_missed"] == "The notice does not give a deadline."
    assert "penalty" not in summary["if_deadline_missed"].lower()


def test_pipeline_explicitly_optional_document_retained_with_label() -> None:
    """Verify that explicitly optional documents ('optional but recommended', is_required: false)
    are retained in required_documents with label 'Suggested, not required', while conditional
    items ('if you have already paid') and alternatives ('a self-declaration instead') are moved to warnings.
    """
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    canned_data["required_documents"] = [
        {
            "name": "Income Certificate",
            "is_required": True,
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "status": "not_completed",
        },
        {
            "name": "Character Certificate (optional but recommended)",
            "is_required": False,
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "status": "not_completed",
        },
        {
            "name": "Payment Receipt",
            "is_required": True,
            "evidence_quote": "If you have already paid, send the receipt",
            "source_page": 1,
            "status": "not_completed",
        },
        {
            "name": "Self-Declaration",
            "is_required": True,
            "evidence_quote": "Candidates may submit a self-declaration instead",
            "source_page": 1,
            "status": "not_completed",
        },
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True

    # Check remaining documents
    docs = res["result"]["required_documents"]
    assert len(docs) == 2
    assert docs[0]["name"] == "Income Certificate"
    assert docs[0]["is_required"] is True

    # Explicitly optional document retained with label
    assert docs[1]["name"] == "Character Certificate (optional but recommended)"
    assert docs[1]["is_required"] is False
    assert docs[1]["label"] == "Suggested, not required"

    # Conditional and alternative items must be moved to technical_notes
    doc_notes = [
        n
        for n in res["result"]["technical_notes"]
        if n.get("code") == "DOCUMENT_CONDITIONAL_OR_ALTERNATIVE"
    ]
    assert len(doc_notes) == 2
    note_texts = " ".join(n["note"] for n in doc_notes)
    assert "Payment Receipt" in note_texts
    assert "Self-Declaration" in note_texts
    user_warnings = res["result"].get("warnings") or []
    assert not any(w.get("code") == "DOCUMENT_CONDITIONAL_OR_ALTERNATIVE" for w in user_warnings)


def test_pipeline_optional_document_with_may_in_quote_retained() -> None:
    """Verify that an optional document whose quote contains 'may' is NOT removed by the 'may' filter."""
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    # Simulate an optional document whose quote includes 'may' and 'optional'
    canned_data["required_documents"] = [
        {
            "name": "Bonus Project Certificate",
            "is_required": False,
            "label": "Suggested, not required",
            "evidence_quote": grounded_quote,
            "source_page": 1,
            "status": "not_completed",
        }
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)
    assert res["status"] == "success"
    docs = res["result"]["required_documents"]
    assert len(docs) == 1
    assert docs[0]["name"] == "Bonus Project Certificate"
    assert docs[0]["is_required"] is False
    assert docs[0]["label"] == "Suggested, not required"


def test_pipeline_eligibility_action_step_at_start_and_option_steps() -> None:
    """Verify canned output with eligibility conditions action step at order 1,
    alternative action steps labelled 'Option 1'/'Option 2', and conditional step labelled
    'If this applies to you'.
    """
    canned_data = get_base_scholarship_canned_data()
    grounded_quote_eligibility = (
        "Scholars must upload their Semester II Official Marksheet and 75% attendance certificate"
    )
    grounded_quote_dossier = "submit semester renewal dossiers online on or before 15-11-2026 to avoid disbursement suspension"

    canned_data["action_steps"] = [
        {
            "order": 1,
            "action": (
                "Check that you meet the conditions in the notice: minimum 75% attendance "
                "and Semester II Official Marksheet without backlog."
            ),
            "evidence_quote": grounded_quote_eligibility,
            "source_page": 1,
            "status": "found",
        },
        {
            "order": 2,
            "action": "Option 1: Submit renewal dossier online at https://scholarships.state.gov.in.",
            "evidence_quote": grounded_quote_dossier,
            "source_page": 1,
            "status": "found",
        },
        {
            "order": 3,
            "action": "Option 2: Submit physical dossier at State Higher Education Directorate counter.",
            "evidence_quote": "State Higher Education Directorate, Scholarship Cell",
            "source_page": 1,
            "status": "found",
        },
        {
            "order": 4,
            "action": "If this applies to you: If you have already received renewal, retain the acknowledgment slip.",
            "evidence_quote": "Target Beneficiaries: All registered awardees under PG Merit Scheme 2025-27",
            "source_page": 1,
            "status": "found",
        },
    ]

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    action_steps = res["result"]["action_steps"]
    assert len(action_steps) == 4

    # Step 1: Eligibility check
    assert action_steps[0]["order"] == 1
    assert action_steps[0]["action"].startswith("Check that you meet the conditions in the notice")
    assert "75% attendance" in action_steps[0]["action"]
    assert action_steps[0]["status"] == "found"

    # Step 2 & 3: Alternatives labelled Option 1 and Option 2
    assert action_steps[1]["action"].startswith("Option 1:")
    assert action_steps[2]["action"].startswith("Option 2:")

    # Step 4: Conditional step labelled "If this applies to you"
    assert action_steps[3]["action"].startswith("If this applies to you:")


def test_prompt_version_and_system_prompt_rules() -> None:
    """Verify that PROMPT_VERSION is 1.4.1 and includes rules for optional documents,
    eligibility action step, alternatives vs sequence, combined action step quote rule,
    and user-facing warnings only.
    """
    assert PROMPT_VERSION == "1.4.1"
    prompt = build_system_prompt()
    assert "Suggested, not required" in prompt
    assert "Check that you meet the conditions in the notice" in prompt
    assert "Option 1" in prompt
    assert "If this applies to you" in prompt
    assert "single sentence that states the action itself" in prompt
    assert "Cash payments above Rs. 10,000 are not accepted" in prompt


def test_pipeline_user_facing_warnings_preserved_and_technical_notes_separated() -> None:
    """Verify that user-facing notice warnings remain in 'warnings', while technical
    checks (grounding, document filter) are recorded in 'technical_notes'.
    """
    canned_data = get_base_scholarship_canned_data()
    grounded_quote = "State Higher Education Directorate, Scholarship Cell"

    # User-facing warning stated in notice
    canned_data["warnings"] = [
        {
            "warning_text": "Cash payments above Rs. 10,000 are not accepted",
            "evidence_quote": grounded_quote,
            "source_page": 1,
        }
    ]

    # Ungrounded title to trigger technical grounding check
    canned_data["notice_title"]["evidence_quote"] = "Non-existent ungrounded title text"

    fake_client = FakeLLMClient(canned_data)
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True

    # User-facing warning must remain in warnings
    user_warnings = res["result"]["warnings"]
    assert len(user_warnings) == 1
    assert user_warnings[0]["warning_text"] == "Cash payments above Rs. 10,000 are not accepted"

    # Technical check must be in technical_notes
    tech_notes = res["result"]["technical_notes"]
    assert any(n.get("code") == "GROUNDING_UNVERIFIED_QUOTE" for n in tech_notes)
    assert not any(n.get("code") == "GROUNDING_UNVERIFIED_QUOTE" for n in user_warnings)

    # Response envelope must also carry technical_notes
    assert len(res["technical_notes"]) == len(tech_notes)
