"""Tests for total pipeline time budget enforcement across OCR, retries, and LLM calls.

Verifies:
1. FakeLLMClient with always_timeout=True fails within budget plus small tolerance.
2. Pipeline returns status 'extraction_failed' with failure_reason 'too_slow', never 'success'.
3. The OCR plus retries case also strictly respects the pipeline budget.
4. Total time is reported with separate breakdowns for OCR time and LLM time.
"""

import time
from pathlib import Path
from typing import Any

import pytest

from extraction.llm_client import FakeLLMClient
from extraction.pipeline import process_notice

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"
SCHOLARSHIP_PDF = FIXTURES_DIR / "scholarship_or_college.pdf"
SCANNED_PDF = FIXTURES_DIR / "scanned_notice_with_text.pdf"


def test_fake_llm_always_times_out_fails_within_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    """FakeLLMClient that always times out must fail within the budget plus a small tolerance."""
    budget = 1.0
    monkeypatch.setenv("PIPELINE_TOTAL_TIMEOUT_SEC", str(budget))

    # FakeLLMClient that simulates a 0.3s timeout on each call
    client = FakeLLMClient(always_timeout=True, timeout_delay=0.3)

    t0 = time.perf_counter()
    res = process_notice(SCHOLARSHIP_PDF, client=client)
    elapsed = time.perf_counter() - t0

    # 1. Pipeline must return the existing too_slow failure, NEVER success
    assert res["status"] == "extraction_failed"
    assert res.get("failure_reason") == "too_slow"
    assert res.get("error_code") == "DOCUMENT_PROCESSING_TIMEOUT"
    assert res["status"] != "success"

    # 2. Must fail within budget plus small tolerance (e.g. 0.6s tolerance on 1.0s budget)
    assert elapsed < budget + 0.6, f"Elapsed {elapsed:.2f}s exceeded budget {budget:.2f}s + tolerance"


def test_ocr_plus_retries_case_respects_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    """The OCR plus retries case must also respect the total time budget."""
    budget = 1.0
    monkeypatch.setenv("PIPELINE_TOTAL_TIMEOUT_SEC", str(budget))

    # Mock OCR to return valid text quickly (0.1s) so OCR and LLM retries both run within budget
    def mock_ocr(page: Any, dpi: int = 300) -> tuple[str, None]:
        time.sleep(0.1)
        return (
            "GOVERNMENT OF MAHARASHTRA\n"
            "POST-GRADUATE SCHOLARSHIP RENEWAL NOTICE 2026-27\n"
            "Primary Submission Deadline: 25 November 2026\n"
            "Previous Semester Official Marksheet",
            None,
        )

    monkeypatch.setattr("extraction.extractor.ocr_page_tesseract", mock_ocr)

    # FakeLLMClient that simulates a 0.2s timeout per call
    client = FakeLLMClient(always_timeout=True, timeout_delay=0.2)

    t0 = time.perf_counter()
    res = process_notice(SCANNED_PDF, client=client, ocr_mode="tesseract")
    elapsed = time.perf_counter() - t0

    # 1. Pipeline returns too_slow failure, never success
    assert res["status"] == "extraction_failed"
    assert res.get("failure_reason") == "too_slow"
    assert res.get("error_code") == "DOCUMENT_PROCESSING_TIMEOUT"
    assert res["status"] != "success"

    # 2. Must respect the budget plus small tolerance
    assert elapsed < budget + 0.5, f"Elapsed {elapsed:.2f}s exceeded budget {budget:.2f}s + tolerance"

    # 3. Time reported separately for OCR and LLM
    assert "ocr_time_sec" in res
    assert "llm_time_sec" in res
    assert res["ocr_time_sec"] >= 0.08
    assert res["llm_time_sec"] >= 0.0


def test_budget_exhaustion_returns_too_slow_never_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """When budget is exhausted, pipeline returns too_slow failure even if client finishes extraction."""
    budget = 0.5
    monkeypatch.setenv("PIPELINE_TOTAL_TIMEOUT_SEC", str(budget))

    # A client that sleeps for 0.6s (exhausting the 0.5s budget) and returns a valid canned notice
    def slow_responder(sys_prompt: str, user_prompt: str) -> str:
        time.sleep(0.6)
        return '{"notice_id": "test-1", "category": "scholarship_or_college", "plain_language_summary": {"what_is_this": "x"}}'

    client = FakeLLMClient(responses=[slow_responder])

    res = process_notice(SCHOLARSHIP_PDF, client=client)

    # Must return too_slow failure, NEVER success
    assert res["status"] == "extraction_failed"
    assert res.get("failure_reason") == "too_slow"
    assert res.get("error_code") == "DOCUMENT_PROCESSING_TIMEOUT"
    assert res["status"] != "success"
