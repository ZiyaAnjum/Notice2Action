"""Unit and integration tests for Phase 7b: long documents, language handling, and layout fixtures.

All tests use FakeLLMClient with canned responses; no external network or API calls.
"""

from pathlib import Path
from typing import Any

import pytest

from extraction.extractor import extract_pages
from extraction.llm_client import FakeLLMClient
from extraction.pipeline import (
    chunk_pages,
    merge_chunk_results,
    post_process_notice,
    process_notice,
)
from validation.validator import validate_notice

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"


def get_base_test_canned_notice(
    category: str = "scholarship_or_college",
    title: str = "STATE UNIVERSITY ADMISSION & SCHOLARSHIP BOARD",
    primary_date: str = "2026-11-25",
) -> dict[str, Any]:
    """Helper creating a minimal schema-compliant notice output."""
    return {
        "category": category,
        "notice_title": {
            "text": title,
            "evidence_quote": title,
            "source_page": 1,
            "status": "found",
        },
        "issuing_organisation": {
            "text": "State Scholarship Directorate",
            "evidence_quote": title,
            "source_page": 1,
            "status": "found",
        },
        "affected_party": {
            "text": "Postgraduate students",
            "evidence_quote": title,
            "source_page": 1,
            "status": "found",
        },
        "main_purpose": {
            "text": "Fellowship admission and document verification",
            "evidence_quote": title,
            "source_page": 1,
            "status": "found",
        },
        "plain_language_summary": {
            "what_is_this": "Postgraduate fellowship application notice",
            "why_it_matters": "Provides fellowship financial support",
            "what_to_do": "Submit application before deadline",
            "where_to_do_it": "Administrative Block Counter 4",
            "if_deadline_missed": "Late fee applies",
        },
        "deadlines": [
            {
                "date": primary_date,
                "description": "Primary application submission",
                "role": "primary",
                "evidence_quote": f"Primary Application Deadline: {primary_date}",
                "source_page": 1,
                "confidence": 0.95,
                "is_ambiguous_or_conflicting": False,
                "status": "found",
            }
        ],
        "required_documents": [
            {
                "name": "Degree Certificate",
                "is_required": True,
                "evidence_quote": "Qualifying Bachelor Degree Certificate",
                "source_page": 1,
                "status": "not_completed",
            }
        ],
        "submission_channel": {
            "channel": "pgfellowship.stateuniv.ac.in",
            "evidence_quote": "pgfellowship.stateuniv.ac.in",
            "source_page": 1,
            "status": "found",
        },
        "penalties": [
            {
                "description": "Late submission surcharge",
                "amount": "Rs. 500",
                "evidence_quote": "require Rs. 500 late fee",
                "source_page": 1,
                "status": "found",
            }
        ],
        "action_steps": [
            {
                "order": 1,
                "action": "Verify eligibility credentials",
                "evidence_quote": "Verify eligibility credentials.",
                "source_page": 1,
                "status": "found",
            }
        ],
        "warnings": [],
        "needs_verification": False,
    }


def test_chunk_pages_partitioning():
    """Verify chunk_pages groups whole pages without splitting individual pages."""
    pages = [
        {"page_number": 1, "text": "Page one text content " * 50},  # ~1150 chars
        {"page_number": 2, "text": "Page two text content " * 50},  # ~1150 chars
        {"page_number": 3, "text": "Page three text content " * 50},  # ~1150 chars
        {"page_number": 4, "text": "Page four text content " * 50},  # ~1150 chars
    ]

    # With high budget (10,000 chars), all 4 pages fit in 1 chunk
    chunks_single = chunk_pages(pages, char_budget=10000)
    assert len(chunks_single) == 1
    assert len(chunks_single[0]) == 4

    # With low budget (2,000 chars), pages 1+2 fit in chunk 1, pages 3+4 in chunk 2
    chunks_multi = chunk_pages(pages, char_budget=2500)
    assert len(chunks_multi) == 2
    assert len(chunks_multi[0]) == 2
    assert chunks_multi[0][0]["page_number"] == 1
    assert chunks_multi[0][1]["page_number"] == 2
    assert len(chunks_multi[1]) == 2
    assert chunks_multi[1][0]["page_number"] == 3
    assert chunks_multi[1][1]["page_number"] == 4


def test_merge_chunk_results_deduplication_and_page_retention():
    """Verify merge_chunk_results deduplicates items and preserves evidence quotes/pages."""
    chunk1 = get_base_test_canned_notice(primary_date="2026-11-20")
    chunk1["deadlines"][0]["source_page"] = 1
    chunk1["deadlines"][0]["evidence_quote"] = "Submission deadline 20 November 2026."

    chunk2 = get_base_test_canned_notice(primary_date="2026-11-20")
    # Duplicate deadline on page 2
    chunk2["deadlines"] = [
        {
            "date": "2026-11-20",
            "description": "Primary application submission",
            "role": "primary",
            "evidence_quote": "Submission deadline 20 November 2026.",
            "source_page": 2,
            "confidence": 0.95,
            "is_ambiguous_or_conflicting": False,
            "status": "found",
        },
        # Distinct extended deadline on page 2
        {
            "date": "2026-12-05",
            "description": "Extended deadline with fine",
            "role": "extended",
            "evidence_quote": "Extended deadline with fine is 05 December 2026.",
            "source_page": 2,
            "confidence": 0.90,
            "is_ambiguous_or_conflicting": False,
            "status": "found",
        },
    ]

    # Required documents: duplicate doc + new doc
    chunk2["required_documents"] = [
        {
            "name": "Degree Certificate",  # Duplicate of chunk 1
            "is_required": True,
            "evidence_quote": "Qualifying Bachelor Degree Certificate",
            "source_page": 2,
            "status": "not_completed",
        },
        {
            "name": "Income Certificate",  # New document
            "is_required": True,
            "evidence_quote": "Income Certificate from Revenue Authority",
            "source_page": 2,
            "status": "not_completed",
        },
    ]

    # Action steps: duplicate step + new step
    chunk2["action_steps"] = [
        {
            "order": 1,
            "action": "Verify eligibility credentials",  # Duplicate of chunk 1
            "evidence_quote": "Verify eligibility credentials.",
            "source_page": 2,
            "status": "found",
        },
        {
            "order": 2,
            "action": "Submit physical hard copy dossier",  # New step
            "evidence_quote": "Submit physical hard copy dossier.",
            "source_page": 2,
            "status": "found",
        },
    ]

    merged = merge_chunk_results([chunk1, chunk2])

    # Deadlines deduplicated to 2 (primary and extended)
    assert len(merged["deadlines"]) == 2
    dates = [d["date"] for d in merged["deadlines"]]
    assert "2026-11-20" in dates
    assert "2026-12-05" in dates

    # Required documents deduplicated to 2 ("Degree Certificate" and "Income Certificate")
    assert len(merged["required_documents"]) == 2
    doc_names = [d["name"] for d in merged["required_documents"]]
    assert "Degree Certificate" in doc_names
    assert "Income Certificate" in doc_names
    # Source page of Income Certificate preserved
    inc_doc = next(d for d in merged["required_documents"] if d["name"] == "Income Certificate")
    assert inc_doc["source_page"] == 2

    # Action steps deduplicated to 2 and renumbered 1, 2
    assert len(merged["action_steps"]) == 2
    assert merged["action_steps"][0]["order"] == 1
    assert merged["action_steps"][1]["order"] == 2
    assert merged["action_steps"][1]["source_page"] == 2


def test_pipeline_long_document_note_and_verification(monkeypatch):
    """Verify long documents trigger chunking, user-facing note, and needs_verification=True."""
    # Force a very small character budget so twelve_page.pdf is chunked
    monkeypatch.setenv("LLM_PROMPT_CHAR_BUDGET", "2000")

    twelve_page_pdf = FIXTURES_DIR / "twelve_page.pdf"
    assert twelve_page_pdf.exists(), "twelve_page.pdf fixture missing"

    canned_data = get_base_test_canned_notice(
        title="GOVERNMENT OF INDIA - MINISTRY OF RURAL DEVELOPMENT",
        primary_date="2026-12-20",
    )
    # Align evidence quote to text on page 1 of twelve_page.pdf
    canned_data["notice_title"]["evidence_quote"] = (
        "GOVERNMENT OF INDIA - MINISTRY OF RURAL DEVELOPMENT"
    )
    canned_data["issuing_organisation"]["evidence_quote"] = (
        "GOVERNMENT OF INDIA - MINISTRY OF RURAL DEVELOPMENT"
    )
    canned_data["affected_party"]["evidence_quote"] = (
        "GOVERNMENT OF INDIA - MINISTRY OF RURAL DEVELOPMENT"
    )
    canned_data["main_purpose"]["evidence_quote"] = (
        "GOVERNMENT OF INDIA - MINISTRY OF RURAL DEVELOPMENT"
    )

    fake_client = FakeLLMClient(canned_data)
    res = process_notice(twelve_page_pdf, client=fake_client)

    assert res["status"] == "success"
    assert res["needs_verification"] is True
    # User-facing warning note is present
    warnings = res["result"]["warnings"]
    assert any("This is a long document; please check all items." in w.get("warning_text", "") for w in warnings)
    long_w = next(w for w in warnings if "long document" in w.get("warning_text", "").lower())
    assert long_w.get("code") == "LONG_DOCUMENT_CHUNKED"


def test_pipeline_chunk_conflicting_primary_deadlines(monkeypatch):
    """Verify that when chunks return two different primary dates, conflict logic flags them."""
    monkeypatch.setenv("LLM_PROMPT_CHAR_BUDGET", "1000")

    pages = [
        {"page_number": 1, "text": "GOVERNMENT SCHOLARSHIP BOARD. Last date is 15 November 2026."},
        {"page_number": 2, "text": "GOVERNMENT SCHOLARSHIP BOARD. Last date is 30 November 2026."},
    ]

    canned_chunk1 = get_base_test_canned_notice(primary_date="2026-11-15")
    canned_chunk1["deadlines"][0]["description"] = "application submission"
    canned_chunk1["deadlines"][0]["role"] = "primary"

    canned_chunk2 = get_base_test_canned_notice(primary_date="2026-11-30")
    canned_chunk2["deadlines"][0]["description"] = "application submission"
    canned_chunk2["deadlines"][0]["role"] = "primary"

    merged = merge_chunk_results([canned_chunk1, canned_chunk2])
    v_report = validate_notice(merged, page_texts=[p["text"] for p in pages])
    processed = post_process_notice(merged, pages, v_report)

    # Both primary deadlines are marked conflicting
    assert processed["needs_verification"] is True
    conflicting = [d for d in processed["deadlines"] if d.get("status") == "conflicting"]
    assert len(conflicting) == 2
    assert "The notice gives two different dates" in conflicting[0]["ambiguity_reason"]


def test_pipeline_total_time_budget_failure(monkeypatch):
    """Verify that exceeding PIPELINE_TOTAL_TIMEOUT_SEC aborts with extraction_failed."""
    monkeypatch.setenv("PIPELINE_TOTAL_TIMEOUT_SEC", "0.0001")

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    fake_client = FakeLLMClient(get_base_test_canned_notice())

    res = process_notice(pdf_path, client=fake_client)
    assert res["status"] == "extraction_failed"
    assert "time budget" in res["message"].lower() or "time limit" in res["message"].lower()
    assert res["needs_verification"] is True


def test_pipeline_non_english_notice_flags_and_warning():
    """Verify non-English notices set detected_language, needs_verification=True, and user warning."""
    bilingual_pdf = FIXTURES_DIR / "bilingual.pdf"
    assert bilingual_pdf.exists(), "bilingual.pdf fixture missing"

    # Bilingual notice contains Devanagari (Marathi/Hindi)
    canned_data = get_base_test_canned_notice(
        category="utility",
        title="MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD.",
        primary_date="2026-11-20",
    )
    canned_data["notice_title"]["evidence_quote"] = "MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD."
    canned_data["issuing_organisation"]["evidence_quote"] = "MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD."
    canned_data["affected_party"]["evidence_quote"] = "MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD."
    canned_data["main_purpose"]["evidence_quote"] = "MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD."

    fake_client = FakeLLMClient(canned_data)
    res = process_notice(bilingual_pdf, client=fake_client)

    assert res["status"] == "success"
    assert res["detected_language"] in ("hi", "devanagari")
    assert res["result"]["detected_language"] in ("hi", "devanagari")
    assert res["needs_verification"] is True

    # User-facing warning for non-English notices
    warnings = res["result"]["warnings"]
    assert any("This notice is not in English. These notices are less tested." in w.get("warning_text", "") for w in warnings)
    non_en_w = next(w for w in warnings if "not in english" in w.get("warning_text", "").lower())
    assert non_en_w.get("code") == "NON_ENGLISH_NOTICE"


def test_unicode_quote_grounding_devanagari_and_kannada():
    """Verify Unicode NFC grounding for Devanagari and Kannada quotes."""
    pages = [
        {
            "page_number": 1,
            "text": "महाराष्ट्र राज्य विद्युत वितरण कंपनी मर्यादित. अंतिम दिनांक 20 नोव्हेंबर 2026.",
        },
        {
            "page_number": 2,
            "text": "ಕರ್ನಾಟಕ ರಾಜ್ಯ ವಿದ್ಯುತ್ ಸರಬರಾಜು ಕಂಪನಿ. ಕೊನೆಯ ದಿನಾಂಕ 25 ನವೆಂಬರ್ 2026.",
        },
    ]

    canned_data = get_base_test_canned_notice(category="utility")
    # Devanagari quote on page 1
    canned_data["notice_title"] = {
        "text": "Maharashtra State Electricity Distribution Notice",
        "evidence_quote": "महाराष्ट्र राज्य विद्युत वितरण कंपनी मर्यादित",
        "source_page": 1,
        "status": "found",
    }
    # Kannada quote on page 2
    canned_data["issuing_organisation"] = {
        "text": "Karnataka State Electricity Supply Company",
        "evidence_quote": "ಕರ್ನಾಟಕ ರಾಜ್ಯ ವಿದ್ಯುತ್ ಸರಬರಾಜು ಕಂಪನಿ",
        "source_page": 2,
        "status": "found",
    }

    report = validate_notice(canned_data, page_texts=[p["text"] for p in pages])
    grounded = post_process_notice(canned_data, pages, report)

    # Both non-English quotes must be verified and remain 'found' without unverified quote warnings
    assert grounded["notice_title"]["status"] == "found"
    assert grounded["issuing_organisation"]["status"] == "found"
    title_quote_warn = [t for t in grounded.get("technical_notes", []) if "notice_title" in t.get("note", "")]
    org_quote_warn = [t for t in grounded.get("technical_notes", []) if "issuing_organisation" in t.get("note", "")]
    assert len(title_quote_warn) == 0
    assert len(org_quote_warn) == 0


@pytest.mark.parametrize(
    "fixture_name,expected_min_pages",
    [
        ("letterhead_table.pdf", 1),
        ("two_column.pdf", 1),
        ("bilingual.pdf", 1),
        ("repeated_footer.pdf", 3),
        ("twelve_page.pdf", 12),
    ],
)
def test_all_new_fixtures_extract_pages_and_process(fixture_name: str, expected_min_pages: int):
    """Verify all 5 new fixtures extract cleanly and process through the pipeline."""
    pdf_path = FIXTURES_DIR / fixture_name
    assert pdf_path.exists(), f"Fixture {fixture_name} not found"

    pages = extract_pages(pdf_path)
    assert len(pages) >= expected_min_pages
    assert all(len(p["text"]) > 20 for p in pages)

    # Test processing through pipeline with FakeLLMClient
    canned = get_base_test_canned_notice(
        title=pages[0]["text"][:60],
        primary_date="2026-11-30",
    )
    canned["notice_title"]["evidence_quote"] = pages[0]["text"][:40]
    canned["issuing_organisation"]["evidence_quote"] = pages[0]["text"][:40]
    canned["affected_party"]["evidence_quote"] = pages[0]["text"][:40]
    canned["main_purpose"]["evidence_quote"] = pages[0]["text"][:40]

    fake_client = FakeLLMClient(canned)
    res = process_notice(pdf_path, client=fake_client)
    assert res["status"] in ("success", "out_of_scope")
