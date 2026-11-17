"""Tests for scripts/ocr_smoke.py manual smoke CLI utility.

Verifies:
1. Command-line argument parsing and defaults.
2. Missing-Tesseract detection and user-friendly error exit without traceback.
3. OCR_MODE=off refusal and instructional error exit.
4. Missing PDF file detection and exit.
5. Offline extraction run without LLM calls when --full is not specified.
6. Execution with --full displaying deadlines, evidence quotes, and warnings.
"""

from typing import Any

import pytest

from scripts.ocr_smoke import DEFAULT_FIXTURE_PATH, build_parser, main


def test_argument_parsing_defaults() -> None:
    """Parser must supply default PDF fixture, None mode, and False for full."""
    parser = build_parser()
    args = parser.parse_args([])
    assert args.pdf_path == DEFAULT_FIXTURE_PATH
    assert args.mode is None
    assert args.full is False


def test_argument_parsing_custom() -> None:
    """Parser must correctly parse custom PDF path, mode, and full flag."""
    parser = build_parser()
    args = parser.parse_args(["custom_notice.pdf", "--mode", "tesseract", "--full"])
    assert args.pdf_path == "custom_notice.pdf"
    assert args.mode == "tesseract"
    assert args.full is True


def test_missing_tesseract_message(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """When Tesseract is missing and --mode tesseract is requested, exit with clear setup message."""
    setup_msg = (
        "Tesseract OCR is not installed or not on system PATH. "
        "Download and install Tesseract from UB-Mannheim."
    )
    monkeypatch.setattr("scripts.ocr_smoke.is_tesseract_installed", lambda: (False, setup_msg))

    exit_code = main(["--mode", "tesseract"])
    assert exit_code == 1

    captured = capsys.readouterr()
    assert "Tesseract Not Installed" in captured.err
    assert "UB-Mannheim" in captured.err
    assert "Traceback" not in captured.err
    assert "Traceback" not in captured.out


def test_ocr_mode_off_exit(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """When OCR mode is 'off' (or not configured), exit with clear message to choose a mode."""
    monkeypatch.setenv("OCR_MODE", "off")

    exit_code = main([])
    assert exit_code == 1

    captured = capsys.readouterr()
    assert "OCR mode is currently 'off'" in captured.err
    assert "--mode tesseract" in captured.err
    assert "Traceback" not in captured.err


def test_missing_pdf_file_exit(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """When target PDF does not exist, exit with a clean file not found message."""
    monkeypatch.setattr("scripts.ocr_smoke.is_tesseract_installed", lambda: (True, None))

    exit_code = main(["non_existent_file.pdf", "--mode", "tesseract"])
    assert exit_code == 1

    captured = capsys.readouterr()
    assert "Target PDF does not exist" in captured.err
    assert "non_existent_file.pdf" in captured.err
    assert "Traceback" not in captured.err


def test_offline_smoke_extraction_without_full(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Without --full, extraction prints per-page details, summary, and makes no LLM calls."""
    monkeypatch.setattr("scripts.ocr_smoke.is_tesseract_installed", lambda: (True, None))

    mock_pages: list[dict[str, Any]] = [
        {
            "page_number": 1,
            "method": "ocr",
            "char_count": 85,
            "text": "GOVERNMENT OF MAHARASHTRA\nPOST-GRADUATE SCHOLARSHIP RENEWAL NOTICE 2026-27",
            "status": "ok",
        }
    ]

    monkeypatch.setattr("scripts.ocr_smoke.extract_pages", lambda path, ocr_mode=None: mock_pages)

    exit_code = main(["--mode", "tesseract"])
    assert exit_code == 0

    captured = capsys.readouterr()
    # Check per-page output
    assert "Page 1:" in captured.out
    assert "Method:          ocr" in captured.out
    assert "Character Count: 85" in captured.out
    assert "Quality Result:  PASS (usable)" in captured.out
    assert "GOVERNMENT OF MAHARASHTRA" in captured.out
    # Check document summary
    assert "OCR Used:          True" in captured.out
    assert "Detected Language: en" in captured.out
    assert "OCR_USED (warning)" in captured.out
    # Verify full pipeline was NOT executed
    assert "FULL PIPELINE EXTRACTION" not in captured.out


def test_smoke_with_full_pipeline(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """With --full and configured API key, runs full pipeline and prints status, deadlines, documents, steps, and summary."""
    monkeypatch.setattr("scripts.ocr_smoke.is_tesseract_installed", lambda: (True, None))
    monkeypatch.setenv("GEMINI_API_KEY", "mock-test-key")

    mock_pages: list[dict[str, Any]] = [
        {
            "page_number": 1,
            "method": "ocr",
            "char_count": 120,
            "text": "Scholarship Notice 2026. Primary Deadline: 25 November 2026.",
            "status": "ok",
        }
    ]
    monkeypatch.setattr("scripts.ocr_smoke.extract_pages", lambda path, ocr_mode=None: mock_pages)

    mock_pipeline_res = {
        "status": "success",
        "category": "scholarship_or_college",
        "ocr_used": True,
        "needs_verification": True,
        "result": {
            "plain_language_summary": {
                "what_is_this": "Post-graduate scholarship renewal notification.",
                "why_it_matters": "Scholars must renew to keep stipends active.",
                "what_to_do": "Submit marksheet and income certificate.",
                "where_to_do_it": "State scholarship portal or Room 104 Pune.",
                "if_deadline_missed": "Late fee applies until 10 Dec.",
            },
            "deadlines": [
                {
                    "description": "Primary Application Deadline",
                    "date": "2026-11-25",
                    "role": "primary",
                    "evidence_quote": "Primary Deadline: 25 November 2026.",
                    "source_page": 1,
                }
            ],
            "required_documents": [
                {
                    "name": "Semester II Marksheet",
                    "is_required": True,
                    "evidence_quote": "Semester II Marksheet mandatory",
                    "source_page": 1,
                }
            ],
            "action_steps": [
                {
                    "order": 1,
                    "action": "Upload verified marksheet to scholarship portal.",
                    "evidence_quote": "Upload verified marksheet online.",
                    "source_page": 1,
                }
            ],
            "warnings": [
                {
                    "code": "OCR_USED",
                    "warning_text": "This notice was read from a scan. Please check all details against your original.",
                    "severity": "warning",
                }
            ],
        },
    }
    monkeypatch.setattr(
        "scripts.ocr_smoke.process_notice",
        lambda path, ocr_mode=None, client=None: mock_pipeline_res,
    )

    exit_code = main(["--mode", "tesseract", "--full"])
    assert exit_code == 0

    captured = capsys.readouterr()
    assert "FULL PIPELINE EXTRACTION" in captured.out
    assert "Status:            success" in captured.out
    assert "Category:          scholarship_or_college" in captured.out
    assert "Needs Verification:True" in captured.out
    # Check Plain-Language Summary output
    assert "Plain-Language Summary:" in captured.out
    assert "Post-graduate scholarship renewal notification." in captured.out
    assert "Scholars must renew to keep stipends active." in captured.out
    # Check Deadlines output
    assert "Primary Application Deadline -> 2026-11-25" in captured.out
    assert 'Evidence Quote: "Primary Deadline: 25 November 2026."' in captured.out
    # Check Required Documents output
    assert "Required Documents:" in captured.out
    assert "Semester II Marksheet (Mandatory)" in captured.out
    # Check Action Steps output
    assert "Action Steps:" in captured.out
    assert "Step 1: Upload verified marksheet to scholarship portal." in captured.out
    # Check Warnings and Total Time
    assert "OCR_USED" in captured.out
    assert "Total Time:" in captured.out


def test_offline_smoke_full_text_flag(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """When --full-text is specified, complete page text (> 300 chars) is printed without truncation."""
    monkeypatch.setattr("scripts.ocr_smoke.is_tesseract_installed", lambda: (True, None))

    long_page_text = "Sentence number one of the long official notice text. " * 15
    assert len(long_page_text) > 400

    mock_pages: list[dict[str, Any]] = [
        {
            "page_number": 1,
            "method": "ocr",
            "char_count": len(long_page_text),
            "text": long_page_text,
            "display_text": long_page_text,
            "status": "ok",
        }
    ]
    monkeypatch.setattr("scripts.ocr_smoke.extract_pages", lambda path, ocr_mode=None: mock_pages)

    exit_code = main(["--mode", "tesseract", "--full-text"])
    assert exit_code == 0

    captured = capsys.readouterr()
    assert "Complete Page Text:" in captured.out
    assert "Text Preview" not in captured.out
    assert "..." not in captured.out
    assert long_page_text.strip() in captured.out
