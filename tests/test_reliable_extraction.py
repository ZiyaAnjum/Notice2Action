"""Comprehensive unit and integration tests for reliable extraction (STEPS 1-6).

Covers:
1. Empty text PDF handling (graceful degrade / raw text returned).
2. Scanned PDF fallback threshold (OCR only if chars < 200/page; never OCR a text PDF).
3. Model timeout handling (capped per-call timeout, partial results returned).
4. Invalid JSON from the model (single targeted repair call containing error message).
5. Relative-date resolution (code computes exact ISO date, marks date_type 'estimated').
6. Evidence-not-found (verified=false, needs verification flag on that field only).
7. Duplicate-sample hit from SHA-256 cache (instant return without re-running pipeline).
"""

import hashlib
import json
from datetime import date
from pathlib import Path

import fitz  # PyMuPDF
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.services.notice_service import NoticeService
from extraction.extractor import OCR_CHAR_THRESHOLD_PER_PAGE, extract_pages
from extraction.llm_client import FakeLLMClient, LLMError
from extraction.llm_extractor import extract_notice_with_llm
from extraction.pipeline import process_notice
from extraction.post_processor import (
    process_extracted_notice_to_decision_card,
    resolve_relative_date,
)
from validation.validator import validate_notice

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SAMPLES_DIR = Path(__file__).resolve().parent.parent / "samples"


# ==============================================================================
# 1. EMPTY TEXT PDF HANDLING
# ==============================================================================
def test_empty_text_pdf_handling(tmp_path: Path) -> None:
    """Verify empty text PDF does not crash the pipeline and returns a structured refusal."""
    empty_pdf_path = tmp_path / "empty_notice.pdf"
    doc = fitz.open()
    doc.new_page()  # Blank page with 0 text
    doc.save(str(empty_pdf_path))
    doc.close()

    pages = extract_pages(empty_pdf_path, ocr_mode="off")
    assert len(pages) == 1
    assert pages[0]["text"] == ""

    # Pipeline run on empty PDF
    res = process_notice(empty_pdf_path, ocr_mode="off")
    assert res["status"] in ("needs_clearer_document", "out_of_scope")
    assert res["result"] is None
    assert "clearer" in res["message"].lower() or "unreadable" in res["message"].lower()


# ==============================================================================
# 2. SCANNED PDF FALLBACK OCR THRESHOLD
# ==============================================================================
def test_scanned_pdf_fallback_threshold() -> None:
    """Verify that a text PDF (chars >= 200/page) is NEVER OCR'd, respecting the threshold."""
    text_pdf_path = FIXTURES_DIR / "utility.pdf"
    assert text_pdf_path.exists()

    pages = extract_pages(text_pdf_path, ocr_mode="tesseract")
    assert len(pages) >= 1
    # Check that OCR was never invoked for this digital text PDF
    assert all(p.get("method") == "text" for p in pages)
    assert getattr(pages, "ocr_pages", 0) == 0
    assert getattr(pages, "ocr_duration", 0.0) == 0.0


def test_ocr_threshold_constant() -> None:
    """Verify OCR_CHAR_THRESHOLD_PER_PAGE is configured per STEP 1 specification."""
    assert OCR_CHAR_THRESHOLD_PER_PAGE == 200


# ==============================================================================
# 3. MODEL TIMEOUT AND BUDGET ENFORCEMENT
# ==============================================================================
def test_model_timeout_handling() -> None:
    """Verify model timeout returns structured failure without crashing."""
    fake_client = FakeLLMClient(
        [
            LLMError("Request timed out after 25s", is_timeout=True, retries_exhausted=True),
        ]
    )

    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    res = process_notice(pdf_path, client=fake_client)

    assert res["status"] in ("extraction_failed", "too_slow")
    assert res["result"] is None or res["result"].get("status") == "partial"
    assert "timeout" in str(res.get("message", "")).lower() or "budget" in str(res.get("message", "")).lower()


# ==============================================================================
# 4. INVALID JSON FROM THE MODEL & TARGETED REPAIR CALL
# ==============================================================================
def test_invalid_json_targeted_repair_call() -> None:
    """Verify invalid JSON on attempt 1 triggers exactly ONE targeted repair call with the error."""
    sample_file = SAMPLES_DIR / "scholarship_renewal_notice.json"
    with open(sample_file, encoding="utf-8") as f:
        valid_notice = json.load(f)

    # Attempt 0: broken JSON; Attempt 1: valid repaired JSON
    responses = [
        "INVALID JSON {broken syntax: true,",
        json.dumps(valid_notice),
    ]
    fake_client = FakeLLMClient(responses)

    pages = [{"page_number": 1, "text": "Scholarship Renewal Notice"}]
    res = extract_notice_with_llm(pages, category="scholarship_or_college", client=fake_client)

    assert res["status"] == "success"
    assert res["data"] is not None
    assert fake_client.call_count == 2
    # Verify the second call prompt included targeted error message
    second_prompt = fake_client.calls[1]["user_prompt"]
    assert "PREVIOUS ATTEMPT FAILED WITH JSON SYNTAX ERROR" in second_prompt


# ==============================================================================
# 5. RELATIVE-DATE RESOLUTION IN CODE
# ==============================================================================
def test_relative_date_resolution_function() -> None:
    """Verify resolve_relative_date computes exact ISO date from base anchor."""
    base_dates = {"due": "2026-11-18", "due_date": "2026-11-18"}
    computed, derived = resolve_relative_date(7, "due_date", base_dates)

    assert computed == "2026-11-25"
    assert derived == {"offset_days": 7, "relative_to": "due_date"}


def test_post_processor_relative_date_and_ordered_deadlines() -> None:
    """Verify post_processor resolves relative deadlines and sorts timeline chronologically."""
    raw_notice = {
        "notice_type": "utility",
        "source_organisation": "Power Corporation",
        "amount_due": "Rs. 4,860.00",
        "deadlines": [
            {
                "label": "Pay without surcharge",
                "kind": "no_penalty_by",
                "date_raw": "18 November 2026",
                "page": 1,
                "quote": "Pay Rs. 4,860.00 without surcharge by 18 November 2026",
            },
            {
                "label": "Disconnection notice period",
                "kind": "disconnection_risk",
                "is_relative": True,
                "offset_days": 15,
                "relative_to": "due_date",
                "page": 1,
                "quote": "within 15 days of the due date",
            },
            {
                "label": "Bill due date",
                "kind": "due",
                "date_raw": "25 November 2026",
                "page": 1,
                "quote": "Due date is 25 November 2026",
            },
        ],
        "action_steps": [
            {"order": 1, "text": "Pay your bill online", "page": 1, "quote": "Pay your bill online"},
            {"order": 2, "text": "   ", "page": 1, "quote": ""},  # Empty text step to be dropped
        ],
        "one_line_summary": "Pay electricity bill of Rs. 4,860 by 18 Nov.",
        "summary_plain": "Your electricity bill of Rs. 4,860 is due. Pay before 18 Nov to avoid surcharge.",
    }

    pages = [
        {
            "page_number": 1,
            "text": (
                "Power Corporation Notice. Pay Rs. 4,860.00 without surcharge by 18 November 2026. "
                "Due date is 25 November 2026. Supply may be disconnected within 15 days of the due date. "
                "Pay your bill online."
            ),
        }
    ]

    card = process_extracted_notice_to_decision_card(raw_notice, pages, reference_date=date(2026, 11, 10))

    # 1. Amount parsed into structured money
    assert card["headline"]["amount_due"] == {"amount": 4860.0, "currency": "INR"}

    # 2. Ordered deadlines (18 Nov -> 25 Nov -> 10 Dec)
    deadlines = card["deadlines"]
    assert len(deadlines) == 3
    assert deadlines[0]["date"] == "2026-11-18"
    assert deadlines[0]["kind"] == "no_penalty_by"
    assert deadlines[0]["date_type"] == "exact"

    assert deadlines[1]["date"] == "2026-11-25"
    assert deadlines[1]["kind"] == "due"

    # Disconnection risk: 25 Nov + 15 days = 10 Dec 2026
    assert deadlines[2]["date"] == "2026-12-10"
    assert deadlines[2]["kind"] == "disconnection_risk"
    assert deadlines[2]["date_type"] == "estimated"
    assert deadlines[2]["derived_from"] == {"offset_days": 15, "relative_to": "due_date"}

    # 3. Urgency computed (18 Nov is 8 days from 10 Nov -> "soon")
    assert card["headline"]["urgency"] == "soon"

    # 4. Action steps: empty step was dropped, remaining step re-numbered to order 1
    assert len(card["action_steps"]) == 1
    assert card["action_steps"][0]["order"] == 1
    assert card["action_steps"][0]["text"] == "Pay your bill online"

    # 5. Evidence quote verified
    assert deadlines[0]["evidence"]["verified"] is True


# ==============================================================================
# 6. EVIDENCE-NOT-FOUND & REPAIR-AND-DEGRADE VALIDATION
# ==============================================================================
def test_evidence_not_found_sets_flag_and_degrades_gracefully() -> None:
    """Verify missing/hallucinated quote sets verified=False and does NOT fail the notice."""
    raw_card = {
        "status": "complete",
        "warnings": [],
        "headline": {
            "one_line_summary": "Pay your utility bill.",
            "notice_type": "utility",
            "source_organisation": "Power Dept",
            "amount_due": {"amount": 1000.0, "currency": "INR"},
            "primary_deadline_id": "dl-1",
            "urgency": "soon",
        },
        "deadlines": [
            {
                "id": "dl-1",
                "label": "Due Date",
                "kind": "due",
                "date": "2026-11-30",
                "date_type": "exact",
                "derived_from": None,
                "evidence": {
                    "page": 1,
                    "quote": "Completely hallucinated non-existent sentence 12345",
                    "verified": True,
                },
            }
        ],
        "action_steps": [
            {
                "order": 1,
                "text": "Pay online",
                "evidence": {"page": 1, "quote": "Real quote present in text", "verified": True},
            }
        ],
        "consequences": [],
        "summary_plain": "Utility bill must be paid by November 30.",
        "raw_text_ref": "Notice from Power Dept. Real quote present in text. Please pay.",
    }

    page_texts = ["Notice from Power Dept. Real quote present in text. Please pay."]
    report = validate_notice(raw_card, page_texts=page_texts)

    # Notice must NOT fail completely because of ungrounded quote
    assert report["is_valid"] is True
    assert report["status"] == "partial"
    validated_notice = report["notice"]

    # That specific field's evidence must be marked verified=False and needs_verification=True
    dl_ev = validated_notice["deadlines"][0]["evidence"]
    assert dl_ev["verified"] is False
    assert dl_ev["needs_verification"] is True
    assert any("could not be verified" in w for w in report["warnings"])


def test_validator_drops_invalid_fields_and_degrades() -> None:
    """Verify validator drops or nulls bad fields instead of rejecting whole notice (STEP 2)."""
    notice_with_bad_field = {
        "headline": {
            "one_line_summary": "Valid summary",
            "notice_type": "bank",
            "source_organisation": "State Bank",
            "amount_due": "INVALID_NOT_A_DICT",  # Invalid type: should be nulled
            "urgency": "none",
        },
        "deadlines": [],
        "action_steps": [
            {"order": 1, "text": "   ", "evidence": {"page": 1, "quote": "", "verified": False}},  # empty text -> dropped
            {"order": 2, "text": "Visit branch", "evidence": {"page": 1, "quote": "Visit branch", "verified": True}},
        ],
        "consequences": [],
        "summary_plain": "Please visit branch to complete KYC update.",
        "raw_text_ref": "State Bank KYC notice. Visit branch with PAN card.",
    }

    report = validate_notice(notice_with_bad_field, page_texts=["State Bank KYC notice. Visit branch with PAN card."])

    assert report["is_valid"] is True
    assert report["status"] == "partial"
    validated = report["notice"]

    # amount_due was nulled with warning
    assert validated["headline"]["amount_due"] is None
    assert any("Dropped invalid field at 'headline.amount_due'" in w for w in validated["warnings"])

    # empty step was dropped and surviving step re-numbered to 1
    assert len(validated["action_steps"]) == 1
    assert validated["action_steps"][0]["order"] == 1
    assert validated["action_steps"][0]["text"] == "Visit branch"


# ==============================================================================
# 7. DUPLICATE SAMPLE HIT FROM SHA-256 CACHE
# ==============================================================================
def test_duplicate_sample_sha256_cache_hit(tmp_path: Path) -> None:
    """Verify uploading identical PDF bytes returns instant cache hit without reprocessing."""
    # Set up isolated in-memory SQLite database
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    service = NoticeService(upload_dir=tmp_path, session_factory=TestingSession)
    sample_bytes = b"%PDF-1.4 Mock PDF content for SHA256 cache verification test"
    file_hash = hashlib.sha256(sample_bytes).hexdigest()

    mock_pdf_path = tmp_path / "test_notice.pdf"
    mock_pdf_path.write_bytes(sample_bytes)

    # 1. First upload: create and simulate completion
    with TestingSession() as db:
        notice1, is_cached1 = service.create_pending_notice(
            db=db,
            notice_id="notice-first-111",
            filename="test_notice.pdf",
            stored_path=mock_pdf_path,
            file_hash=file_hash,
        )
        assert is_cached1 is False
        assert notice1.status == "processing"

        # Simulate pipeline completion
        notice1.status = "complete"
        notice1.stage = "done"
        notice1.progress = 100
        notice1.category = "utility"
        notice1.result_json = {"headline": {"one_line_summary": "Cached Electricity Notice"}}
        db.commit()

    # 2. Second upload with identical bytes: must trigger instant cache hit
    with TestingSession() as db:
        notice2, is_cached2 = service.create_pending_notice(
            db=db,
            notice_id="notice-second-222",
            filename="test_notice.pdf",
            stored_path=mock_pdf_path,
            file_hash=file_hash,
        )

        assert is_cached2 is True
        assert notice2.status == "complete"
        assert notice2.stage == "done"
        assert notice2.progress == 100
        assert notice2.result_json == {"headline": {"one_line_summary": "Cached Electricity Notice"}}
        assert notice2.file_hash == file_hash


def test_stage_tracking_and_polling_lifecycle(tmp_path: Path) -> None:
    """Verify notice service stage lifecycle: uploading -> reading_text -> done with progress."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    service = NoticeService(upload_dir=tmp_path, session_factory=TestingSession)
    real_pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"

    # 1. Initial pending stage
    with TestingSession() as db:
        notice, is_cached = service.create_pending_notice(
            db=db,
            notice_id="notice-stage-123",
            filename="scholarship.pdf",
            stored_path=real_pdf_path,
        )
        assert is_cached is False
        assert notice.status == "processing"
        assert notice.stage == "uploading"
        assert notice.progress == 10

        detail_initial = service.get_notice_detail(db, "notice-stage-123")
        assert detail_initial is not None
        assert detail_initial["status"] == "processing"
        assert detail_initial["stage"] == "uploading"
        assert detail_initial["progress"] == 10
        assert detail_initial["notice_id"] == "notice-stage-123"

    # 2. Run background pipeline with FakeLLMClient returning valid scholarship notice
    sample_file = SAMPLES_DIR / "scholarship_renewal_notice.json"
    with open(sample_file, encoding="utf-8") as f:
        canned_data = json.load(f)

    fake_client = FakeLLMClient(canned_data)
    service.run_background_pipeline("notice-stage-123", str(real_pdf_path), llm_client=fake_client)

    # 3. Poll completed stage
    with TestingSession() as db:
        detail_done = service.get_notice_detail(db, "notice-stage-123")
        assert detail_done is not None
        assert detail_done["status"] in ("complete", "partial", "processed")
        assert detail_done["stage"] == "done"
        assert detail_done["progress"] == 100
        assert detail_done["result"] is not None


def test_unreadable_pdf_human_readable_error(tmp_path: Path) -> None:
    """Verify unreadable scanned PDF returns human-readable message with error_code."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    service = NoticeService(upload_dir=tmp_path, session_factory=TestingSession)
    corrupt_pdf_path = tmp_path / "blank.pdf"
    doc = fitz.open()
    doc.new_page()
    doc.save(str(corrupt_pdf_path))
    doc.close()

    with TestingSession() as db:
        notice, _ = service.create_pending_notice(
            db=db,
            notice_id="notice-unreadable-456",
            filename="blank.pdf",
            stored_path=corrupt_pdf_path,
        )

    service.run_background_pipeline("notice-unreadable-456", str(corrupt_pdf_path))

    with TestingSession() as db:
        detail = service.get_notice_detail(db, "notice-unreadable-456")
        assert detail is not None
        assert detail["status"] == "failed"
        assert detail["stage"] == "done"
        assert detail["error_code"] == "UNREADABLE_DOCUMENT"
        assert "clearer scan" in detail["error"]
