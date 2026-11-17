"""Tests for OCR fallback functionality on scanned and image-only PDF pages.

Offline unit and pipeline tests covering:
1. OCR text quality checks (empty, short, garbage/noise vs valid text).
2. Tesseract installation detection and Windows setup guidance message.
3. Safe error handling when Tesseract is missing (never crashes).
4. Default behavior: OCR_MODE=off refuses scanned PDF with needs_clearer_document.
5. OCR_MODE=tesseract processes scanned PDF with mocked OCR, sets ocr_used and OCR_USED warning.
6. OCR_MODE=gemini_vision transcribes page image via FakeLLMClient.
7. OCR_GEMINI_MAX_PAGES caps vision transcription and emits OCR_PAGE_CAP_REACHED warning.
8. Mixed documents (digital text + unreadable scan) proceed and emit PARTIAL_PAGE_UNREADABLE warning.
9. Quote grounding and verification work correctly against OCR-extracted page text.
"""

import io
from pathlib import Path
from typing import Any

import pymupdf
import pytest
from PIL import Image, ImageDraw

from extraction.extractor import extract_pages
from extraction.llm_client import FakeLLMClient
from extraction.ocr import (
    DEFAULT_MIN_CHARS,
    DEFAULT_TESSERACT_DPI,
    TESSERACT_WINDOWS_SETUP_MESSAGE,
    check_ocr_quality,
    is_tesseract_installed,
    ocr_page_tesseract,
    repair_ocr_spacing,
    score_ocr_candidate,
    select_best_ocr_text,
)
from extraction.pipeline import post_process_notice, process_notice
from validation.validator import validate_notice

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"
SCANNED_FIXTURE_PATH = FIXTURES_DIR / "scanned_notice_with_text.pdf"

SAMPLE_SCANNED_TEXT = (
    "GOVERNMENT OF MAHARASHTRA\n"
    "DIRECTORATE OF HIGHER EDUCATION, PUNE\n"
    "POST-GRADUATE SCHOLARSHIP RENEWAL NOTICE 2026-27\n"
    "Notice Reference: DHE/SCH/2026/4011\n"
    "Date of Issuance: 01 November 2026\n"
    "All eligible postgraduate scholars are hereby informed that the scholarship renewal portal "
    "is open for submission of academic dossiers for the upcoming academic semester.\n"
    "1. Mandatory Submission Deadlines:\n"
    "   Primary Application Deadline: 25 November 2026\n"
    "   Extended Deadline with late fee: 10 December 2026\n"
    "2. Required Verification Documents:\n"
    "   - Previous Semester Official Marksheet\n"
    "   - Tahsildar Verified Income Certificate\n"
    "   - Bonafide Institutional Enrolment Certificate\n"
    "3. Submission Venue and Helpdesk:\n"
    "   Online Portal: dhescholarship.maharashtra.gov.in\n"
    "   Physical Verification Counter: Room 104, Central Administrative Building, Pune\n"
    "4. Statutory Notice Warnings & Conditions:\n"
    "   Warning: Cash transactions are strictly prohibited at verification counters.\n"
    "   Applications with incomplete seals will be summarily rejected without review."
)


def get_canned_ocr_structured_notice() -> dict[str, Any]:
    """Return valid structured notice JSON matching SAMPLE_SCANNED_TEXT."""
    return {
        "notice_id": "notice-ocr-test-001",
        "schema_version": "1.0",
        "category": "scholarship_or_college",
        "notice_title": {
            "text": "Post-Graduate Scholarship Renewal Notice 2026-27",
            "evidence_quote": "POST-GRADUATE SCHOLARSHIP RENEWAL NOTICE 2026-27",
            "source_page": 1,
            "status": "found",
        },
        "issuing_organisation": {
            "text": "Directorate of Higher Education, Pune",
            "evidence_quote": "DIRECTORATE OF HIGHER EDUCATION, PUNE",
            "source_page": 1,
            "status": "found",
        },
        "affected_party": {
            "text": "All eligible postgraduate scholars",
            "evidence_quote": "All eligible postgraduate scholars are hereby informed that the scholarship renewal portal",
            "source_page": 1,
            "status": "found",
        },
        "main_purpose": {
            "text": "Submission of academic dossiers for scholarship renewal",
            "evidence_quote": "is open for submission of academic dossiers for the upcoming academic semester.",
            "source_page": 1,
            "status": "found",
        },
        "plain_language_summary": {
            "what_is_this": "Renewal notice for post-graduate scholarship.",
            "why_it_matters": "Scholars must renew their applications to continue receiving financial support.",
            "what_to_do": "Submit previous marksheet and income certificate before the deadline.",
            "where_to_do_it": "Online portal dhescholarship.maharashtra.gov.in or Room 104 Pune.",
            "if_deadline_missed": "Late fee applies until 10 December 2026, after which applications are rejected.",
        },
        "deadlines": [
            {
                "date": "2026-11-25",
                "description": "Primary Application Deadline",
                "evidence_quote": "Primary Application Deadline: 25 November 2026",
                "source_page": 1,
                "confidence": 0.98,
                "is_ambiguous_or_conflicting": False,
                "ambiguity_reason": None,
                "role": "primary",
                "status": "found",
            },
            {
                "date": "2026-12-10",
                "description": "Extended Deadline with late fee",
                "evidence_quote": "Extended Deadline with late fee: 10 December 2026",
                "source_page": 1,
                "confidence": 0.95,
                "is_ambiguous_or_conflicting": False,
                "ambiguity_reason": None,
                "role": "extended",
                "status": "found",
            },
        ],
        "required_documents": [
            {
                "name": "Previous Semester Official Marksheet",
                "evidence_quote": "Previous Semester Official Marksheet",
                "source_page": 1,
                "is_required": True,
                "status": "not_completed",
            },
            {
                "name": "Tahsildar Verified Income Certificate",
                "evidence_quote": "Tahsildar Verified Income Certificate",
                "source_page": 1,
                "is_required": True,
                "status": "not_completed",
            },
        ],
        "submission_channel": {
            "channel": "online",
            "evidence_quote": "Online Portal: dhescholarship.maharashtra.gov.in",
            "source_page": 1,
            "status": "found",
        },
        "penalties": [],
        "action_steps": [
            {
                "order": 1,
                "action": "Submit academic dossier via online portal or physical counter.",
                "evidence_quote": "All eligible postgraduate scholars are hereby informed that the scholarship renewal portal",
                "source_page": 1,
                "status": "found",
            }
        ],
        "warnings": [
            {
                "warning_text": "Cash transactions are strictly prohibited at verification counters.",
                "evidence_quote": "Warning: Cash transactions are strictly prohibited at verification counters.",
                "source_page": 1,
                "code": "CASH_PROHIBITED",
                "severity": "warning",
            }
        ],
        "needs_verification": False,
        "document_quality": "good",
        "extracted_at": "2026-11-06T12:00:00Z",
    }


# =====================================================================
# 1. OCR Quality Checks
# =====================================================================


def test_check_ocr_quality_empty_and_whitespace() -> None:
    """Empty or whitespace-only OCR strings must be treated as unreadable."""
    usable, reason = check_ocr_quality("")
    assert not usable
    assert "empty" in reason.lower()

    usable, reason = check_ocr_quality(None)
    assert not usable
    assert "empty" in reason.lower()

    usable, reason = check_ocr_quality("   \n\t  \r  ")
    assert not usable
    assert "empty" in reason.lower() or "whitespace" in reason.lower()


def test_check_ocr_quality_too_short() -> None:
    """OCR output shorter than min_chars must be rejected as unreadable."""
    short_text = "Hello world"
    assert len(short_text) < DEFAULT_MIN_CHARS
    usable, reason = check_ocr_quality(short_text)
    assert not usable
    assert "too short" in reason.lower()
    assert str(DEFAULT_MIN_CHARS) in reason


def test_check_ocr_quality_non_alphanumeric_garbage() -> None:
    """OCR output composed largely of non-alphanumeric noise must be rejected."""
    # 50 characters of punctuation and noise
    garbage_text = "!@#$%^&*()_+=--~`[]{}|;:'\",.<>?/\\~!@#$%^&*()_+="
    usable, reason = check_ocr_quality(garbage_text)
    assert not usable
    assert "noise" in reason.lower() or "garbage" in reason.lower()


def test_check_ocr_quality_valid_text() -> None:
    """Normal extracted text with sufficient length and alphanumeric ratio passes."""
    usable, reason = check_ocr_quality(SAMPLE_SCANNED_TEXT)
    assert usable
    assert reason == "ok"


def test_check_ocr_quality_custom_thresholds() -> None:
    """Custom min_chars and min_alpha_ratio thresholds are respected."""
    text = "Short text 12345"
    usable, _ = check_ocr_quality(text, min_chars=10, min_alpha_ratio=0.5)
    assert usable

    usable, reason = check_ocr_quality(text, min_chars=30, min_alpha_ratio=0.5)
    assert not usable
    assert "too short" in reason.lower()


# =====================================================================
# 2. Tesseract Availability and Windows Setup Detection
# =====================================================================


def test_is_tesseract_installed_missing_pytesseract(monkeypatch: pytest.MonkeyPatch) -> None:
    """When pytesseract library is unimportable, a clear installation message is returned."""
    import builtins

    real_import = builtins.__import__

    def mock_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == "pytesseract":
            raise ImportError("No module named 'pytesseract'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", mock_import)
    is_avail, msg = is_tesseract_installed()
    assert not is_avail
    assert msg is not None
    assert "pip install pytesseract" in msg


def test_is_tesseract_installed_missing_binary(monkeypatch: pytest.MonkeyPatch) -> None:
    """When binary is not on PATH or standard candidate paths, returns Windows setup instructions."""
    import sys
    import types

    fake_pytesseract = types.ModuleType("pytesseract")
    fake_pytesseract.pytesseract = types.SimpleNamespace(tesseract_cmd="tesseract")  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    monkeypatch.setattr("shutil.which", lambda cmd: None)
    monkeypatch.setattr("extraction.ocr.COMMON_WINDOWS_TESSERACT_PATHS", [])
    monkeypatch.setenv("LOCALAPPDATA", r"C:\NonExistentDir")

    is_avail, msg = is_tesseract_installed()
    assert not is_avail
    assert msg == TESSERACT_WINDOWS_SETUP_MESSAGE
    assert "UB-Mannheim" in msg
    assert "PATH" in msg


def test_is_tesseract_installed_found_on_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """When tesseract binary is discovered on system PATH, returns (True, None)."""
    # Create fake module for pytesseract if not installed in env
    import sys
    import types

    fake_pytesseract = types.ModuleType("pytesseract")
    fake_pytesseract.pytesseract = types.SimpleNamespace(tesseract_cmd="tesseract")  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    monkeypatch.setattr("shutil.which", lambda cmd: r"C:\Program Files\Tesseract-OCR\tesseract.exe")

    is_avail, msg = is_tesseract_installed()
    assert is_avail
    assert msg is None


def test_ocr_page_tesseract_never_crashes_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """ocr_page_tesseract returns (None, setup_message) without throwing an uncaught exception."""
    monkeypatch.setattr("extraction.ocr.is_tesseract_installed", lambda: (False, TESSERACT_WINDOWS_SETUP_MESSAGE))

    doc = pymupdf.open()
    page = doc.new_page()
    text, err = ocr_page_tesseract(page)
    doc.close()

    assert text is None
    assert err == TESSERACT_WINDOWS_SETUP_MESSAGE


# =====================================================================
# 3. OCR_MODE=off (Default Behavior) Refuses Scanned Documents
# =====================================================================


def test_ocr_mode_off_refuses_scanned_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    """When OCR_MODE=off (default), a scanned image PDF produces needs_clearer_document refusal."""
    monkeypatch.setenv("OCR_MODE", "off")

    client = FakeLLMClient(get_canned_ocr_structured_notice())
    res = process_notice(SCANNED_FIXTURE_PATH, ocr_mode="off", client=client)

    assert res["status"] == "needs_clearer_document"
    assert res["category"] == "other_out_of_scope"
    assert res["result"] is None
    assert "unreadable or scanned pages" in res["message"].lower() or "clearer" in res["message"].lower()
    # No LLM calls should have been made
    assert client.call_count == 0


# =====================================================================
# 4. OCR_MODE=tesseract With Mocked OCR Engine
# =====================================================================


def test_ocr_mode_tesseract_processes_scan_with_warnings(monkeypatch: pytest.MonkeyPatch) -> None:
    """With OCR_MODE=tesseract and working OCR, pipeline extracts notice and sets OCR_USED warning."""
    monkeypatch.setenv("OCR_MODE", "tesseract")
    monkeypatch.setattr(
        "extraction.extractor.ocr_page_tesseract",
        lambda page, dpi=200: (SAMPLE_SCANNED_TEXT, None),
    )

    canned = get_canned_ocr_structured_notice()
    client = FakeLLMClient(canned)

    res = process_notice(SCANNED_FIXTURE_PATH, ocr_mode="tesseract", client=client)

    assert res["status"] == "success"
    assert res["ocr_used"] is True
    assert res["needs_verification"] is True
    assert res["result"] is not None
    assert res["result"]["ocr_used"] is True

    # Check that OCR_USED warning is present in user-facing warnings
    warnings = res["result"].get("warnings", [])
    ocr_warnings = [w for w in warnings if w.get("code") == "OCR_USED"]
    assert len(ocr_warnings) == 1
    assert "read from a scan" in ocr_warnings[0]["warning_text"]
    assert ocr_warnings[0]["severity"] == "warning"


# =====================================================================
# 5. OCR_MODE=gemini_vision Multimodal Transcription
# =====================================================================


def test_ocr_mode_gemini_vision_with_fake_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """With OCR_MODE=gemini_vision, page image is sent to FakeLLMClient vision transcription."""
    monkeypatch.setenv("OCR_MODE", "gemini_vision")

    canned = get_canned_ocr_structured_notice()
    client = FakeLLMClient(
        responses=[canned],
        vision_responses=[SAMPLE_SCANNED_TEXT],
    )

    res = process_notice(SCANNED_FIXTURE_PATH, ocr_mode="gemini_vision", client=client)

    assert res["status"] == "success"
    assert res["ocr_used"] is True
    assert res["needs_verification"] is True
    assert len(client.vision_calls) == 1
    assert client.vision_calls[0]["mime_type"] == "image/png"

    # OCR_USED warning present
    warnings = res["result"].get("warnings", [])
    ocr_warnings = [w for w in warnings if w.get("code") == "OCR_USED"]
    assert len(ocr_warnings) == 1


# =====================================================================
# 6. OCR_GEMINI_MAX_PAGES Page Cap Enforcement
# =====================================================================


def test_ocr_gemini_vision_page_cap(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """When scanned pages exceed OCR_GEMINI_MAX_PAGES, extra pages are capped and warned."""
    # Generate a temporary 2-page scanned image PDF
    pdf_path = tmp_path / "two_page_scanned.pdf"
    doc = pymupdf.open()
    for _ in range(2):
        img = Image.new("RGB", (300, 400), color=(250, 250, 250))
        draw = ImageDraw.Draw(img)
        draw.text((20, 20), "Sample scan page", fill=(0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        page = doc.new_page(width=300, height=400)
        page.insert_image(page.rect, stream=buf.getvalue())
    doc.save(str(pdf_path))
    doc.close()

    monkeypatch.setenv("OCR_MODE", "gemini_vision")
    monkeypatch.setenv("OCR_GEMINI_MAX_PAGES", "1")

    client = FakeLLMClient(
        responses=[get_canned_ocr_structured_notice()],
        vision_responses=[SAMPLE_SCANNED_TEXT],
    )

    pages = extract_pages(pdf_path, ocr_mode="gemini_vision", client=client)
    assert len(pages) == 2
    assert pages[0]["method"] == "ocr"
    assert pages[1]["method"] == "unreadable"
    assert pages[1].get("ocr_cap_hit") is True

    # Process through pipeline and verify OCR_PAGE_CAP_REACHED warning
    res = process_notice(pdf_path, ocr_mode="gemini_vision", client=client)
    assert res["status"] == "success"
    assert res["ocr_used"] is True
    assert res["needs_verification"] is True

    warnings = res["result"].get("warnings", [])
    cap_warnings = [w for w in warnings if w.get("code") == "OCR_PAGE_CAP_REACHED"]
    assert len(cap_warnings) == 1
    assert "OCR page limit reached" in cap_warnings[0]["warning_text"]


# =====================================================================
# 7. Mixed Documents (Digital Text + Unreadable Scanned Pages)
# =====================================================================


def test_mixed_document_partial_page_unreadable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """In a mixed document, readable pages are processed and unreadable pages emit PARTIAL_PAGE_UNREADABLE."""
    pdf_path = tmp_path / "mixed_document.pdf"
    doc = pymupdf.open()

    # Page 1: Digital text (scholarship content)
    p1 = doc.new_page(width=612, height=792)
    p1.insert_text((50, 70), SAMPLE_SCANNED_TEXT)

    # Page 2: Blank/unreadable image (no text)
    img = Image.new("RGB", (300, 400), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    p2 = doc.new_page(width=612, height=792)
    p2.insert_image(p2.rect, stream=buf.getvalue())

    doc.save(str(pdf_path))
    doc.close()

    monkeypatch.setenv("OCR_MODE", "off")

    canned = get_canned_ocr_structured_notice()
    client = FakeLLMClient(canned)

    res = process_notice(pdf_path, ocr_mode="off", client=client)

    assert res["status"] == "success"
    assert res["ocr_used"] is False  # Digital text was used for page 1
    assert res["needs_verification"] is True

    warnings = res["result"].get("warnings", [])
    partial_warnings = [w for w in warnings if w.get("code") == "PARTIAL_PAGE_UNREADABLE"]
    assert len(partial_warnings) == 1
    assert "Page(s) 2" in partial_warnings[0]["warning_text"]
    assert "skipped" in partial_warnings[0]["warning_text"]


# =====================================================================
# 8. Quote Grounding Against OCR-Extracted Text
# =====================================================================


def test_quote_grounding_against_ocr_text() -> None:
    """Verifies that quotes in OCR-derived text are validated correctly by post-processing."""
    pages = [
        {
            "page_number": 1,
            "text": SAMPLE_SCANNED_TEXT,
            "method": "ocr",
            "char_count": len(SAMPLE_SCANNED_TEXT),
            "status": "ok",
        }
    ]

    canned = get_canned_ocr_structured_notice()
    validation_report = validate_notice(canned, page_texts=[SAMPLE_SCANNED_TEXT])

    grounded = post_process_notice(canned, pages, validation_report)

    # Verbatim quote present in OCR text must remain found
    assert grounded["notice_title"]["status"] == "found"
    assert grounded["deadlines"][0]["status"] == "found"
    assert grounded["required_documents"][0]["name"] == "Previous Semester Official Marksheet"

    # Now inject a hallucinated quote not present in OCR text
    canned_with_hallucination = get_canned_ocr_structured_notice()
    canned_with_hallucination["main_purpose"]["evidence_quote"] = "Non-existent text that was never in the notice."

    validation_report_hallucinated = validate_notice(
        canned_with_hallucination, page_texts=[SAMPLE_SCANNED_TEXT]
    )
    grounded_hallucinated = post_process_notice(
        canned_with_hallucination, pages, validation_report_hallucinated
    )

    assert grounded_hallucinated["main_purpose"]["status"] == "uncertain"
    assert grounded_hallucinated["needs_verification"] is True

    # Technical note must record the unverified quote
    tech_notes = grounded_hallucinated.get("technical_notes", [])
    unverified_notes = [n for n in tech_notes if n.get("code") == "GROUNDING_UNVERIFIED_QUOTE"]
    assert len(unverified_notes) >= 1



# =====================================================================
# 9. Tesseract PSM Selection & Candidate Scoring
# =====================================================================


def test_score_ocr_candidate_metrics() -> None:
    """Verify scoring logic computes dictionary share, alpha ratio, and char count."""
    # Empty string
    assert score_ocr_candidate("") == (0.0, 0.0, 0)
    assert score_ocr_candidate(None) == (0.0, 0.0, 0)

    # Clean natural words
    clean_text = "Directorate of Higher Education Pune Scholarship Notice 2026"
    dict_share, alpha_ratio, alnum_count = score_ocr_candidate(clean_text)
    assert dict_share >= 0.85
    assert alpha_ratio >= 0.90
    assert alnum_count > 40

    # Garbage / noisy text
    garbage_text = "###@@@ !!**&& 12//$$ --|| %%^^ 99"
    g_share, g_alpha, _ = score_ocr_candidate(garbage_text)
    assert g_share == 0.0
    assert g_alpha < 0.30


def test_select_best_ocr_text_dictionary_share() -> None:
    """select_best_ocr_text chooses candidate with higher dictionary token share."""
    candidate_psm6 = "Govt of Maharashtra Higher Education Scholarship Notice 2026"
    candidate_psm4 = "G0vt 0f M@h@r@shtra H1gh3r 3duc@t10n Sch0l@rsh1p N0t1c3"

    best_text, chosen_psm = select_best_ocr_text(candidate_psm6, candidate_psm4)
    assert chosen_psm == 6
    assert best_text == candidate_psm6

    # Reverse: PSM 4 is cleaner
    best_text2, chosen_psm2 = select_best_ocr_text(candidate_psm4, candidate_psm6)
    assert chosen_psm2 == 4
    assert best_text2 == candidate_psm6


def test_select_best_ocr_text_alpha_ratio_and_length() -> None:
    """When dictionary share is close, chooses higher alphanumeric ratio or longer length."""
    # Similar dictionary words, but PSM 4 has much fewer non-alphanumeric artifacts
    psm6_noisy = "Valid Title Notice 2026 ######### ******* //////"
    psm4_clean = "Valid Title Notice 2026"

    best_text, chosen_psm = select_best_ocr_text(psm6_noisy, psm4_clean)
    assert chosen_psm == 4
    assert best_text == psm4_clean

    # Similar quality ratios, choose longer text (didn't drop paragraphs)
    short_text = "Scholarship Notice 2026"
    long_text = "Scholarship Notice 2026 Directorate of Higher Education Pune"
    best_text2, chosen_psm2 = select_best_ocr_text(short_text, long_text)
    assert chosen_psm2 == 4
    assert best_text2 == long_text


def test_ocr_page_tesseract_psm_execution_and_logging(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """ocr_page_tesseract runs both PSM 6 and PSM 4, chooses superior candidate, and logs decision."""
    import logging
    import sys
    import types

    monkeypatch.setattr("extraction.ocr.is_tesseract_installed", lambda: (True, None))

    calls: list[str] = []

    def mock_image_to_string(img: Any, lang: str = "eng", config: str = "") -> str:
        calls.append(config)
        if "--psm 6" in config:
            return "Noisy Block @#$ 12345"
        if "--psm 4" in config:
            return "Government of Maharashtra Directorate of Higher Education Pune 2026"
        return "Default text"

    fake_pytesseract = types.ModuleType("pytesseract")
    fake_pytesseract.image_to_string = mock_image_to_string  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)

    doc = pymupdf.open()
    page = doc.new_page()

    with caplog.at_level(logging.INFO):
        chosen_text, err = ocr_page_tesseract(page, dpi=DEFAULT_TESSERACT_DPI)

    doc.close()

    assert err is None
    assert chosen_text == "Government of Maharashtra Directorate of Higher Education Pune 2026"
    assert any("--psm 6" in c for c in calls)
    assert any("--psm 4" in c for c in calls)
    assert "Tesseract PSM selection: chosen PSM 4" in caplog.text


# =====================================================================
# 10. Post-OCR Spacing Repair & Grounding Separation
# =====================================================================


def test_repair_ocr_spacing_rules() -> None:
    """Verify repair_ocr_spacing cleans punctuation, brackets, line wraps, and whitespace."""
    # 1. Hyphenated line wrap
    raw_hyphen = "postgraduate scholarship renew-\n  al portal is open."
    repaired_hyphen = repair_ocr_spacing(raw_hyphen)
    assert "renewal" in repaired_hyphen

    # 2. Space before punctuation
    raw_punct = "Directorate of Higher  Education , Pune . Deadline : 25 Nov ;"
    repaired_punct = repair_ocr_spacing(raw_punct)
    assert "Education," in repaired_punct
    assert "Pune." in repaired_punct
    assert "Deadline:" in repaired_punct

    # 3. Missing space after punctuation
    raw_missing = "Submit online,at Room 104:Pune office.All scholars"
    repaired_missing = repair_ocr_spacing(raw_missing)
    assert "online, at" in repaired_missing
    assert "104: Pune" in repaired_missing
    assert "office. All" in repaired_missing

    # 4. Spaces inside parentheses
    raw_bracket = "Extended Deadline ( 10 December 2026 )"
    repaired_bracket = repair_ocr_spacing(raw_bracket)
    assert "(10 December 2026)" in repaired_bracket

    # 5. Redundant horizontal spaces
    raw_spaces = "Important    notice       with   wide     spaces"
    assert repair_ocr_spacing(raw_spaces) == "Important notice with wide spaces"


def test_ocr_spacing_repair_split_leaves_quote_grounding_intact() -> None:
    """Verifies that verbatim OCR text is used for quote grounding while display/summary text is repaired."""
    # OCR output with spacing artifact: space before comma and space before period
    raw_ocr_with_artifacts = (
        "GOVERNMENT OF MAHARASHTRA\n"
        "DIRECTORATE OF HIGHER EDUCATION , PUNE .\n"
        "POST-GRADUATE SCHOLARSHIP RENEWAL NOTICE 2026-27\n"
        "Submission Deadline : 25 November 2026 .\n"
        "Previous Semester Official Marksheet\n"
        "Tahsildar Verified Income Certificate"
    )

    pages = [
        {
            "page_number": 1,
            "text": raw_ocr_with_artifacts,  # Verbatim for quote grounding
            "display_text": repair_ocr_spacing(raw_ocr_with_artifacts),  # Repaired for display
            "method": "ocr",
            "char_count": len(raw_ocr_with_artifacts),
            "status": "ok",
        }
    ]

    canned = get_canned_ocr_structured_notice()
    # The quote extracted character-for-character from the verbatim OCR text
    canned["issuing_organisation"]["evidence_quote"] = "DIRECTORATE OF HIGHER EDUCATION , PUNE ."
    canned["plain_language_summary"]["what_is_this"] = "Renewal notice  , for scholarship ."

    validation_report = validate_notice(canned, page_texts=[raw_ocr_with_artifacts])
    grounded = post_process_notice(canned, pages, validation_report)

    # Verbatim quote matches verbatim OCR text exactly -> found
    assert grounded["issuing_organisation"]["status"] == "found"

    # plain_language_summary text received post-OCR spacing repair
    summary_text = grounded["plain_language_summary"]["what_is_this"]
    assert "notice, for" in summary_text
    assert "  ," not in summary_text
