"""PDF text extraction pipeline for Notice to Action.

Uses PyMuPDF (fitz) for fast, robust page-by-page text extraction with
whitespace normalization and optional fallback to OCR when images lack text.
"""

import logging
import os
import time
from pathlib import Path
from typing import Any

import pymupdf

from extraction.llm_client import BaseLLMClient, get_llm_client
from extraction.ocr import (
    DEFAULT_GEMINI_DPI,
    DEFAULT_GEMINI_MAX_PAGES,
    DEFAULT_TESSERACT_DPI,
    check_ocr_quality,
    get_ocr_mode,
    ocr_page_gemini_vision,
    ocr_page_tesseract,
    repair_ocr_spacing,
)
from validation.validator import normalize_whitespace

logger = logging.getLogger(__name__)

# Constants for document ingestion constraints
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB limit
MAX_PAGE_COUNT = 100
MIN_USABLE_CHAR_COUNT = 15


class ExtractionError(Exception):
    """User-friendly exception for document reading and extraction failures."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ExtractionFileNotFoundError(FileNotFoundError, ExtractionError):
    """Raised when the specified file path does not exist."""

    pass


class ExtractionInvalidFormatError(ValueError, ExtractionError):
    """Raised when the file is not a supported PDF format."""

    pass


def try_ocr_page(page: Any) -> str | None:
    """Attempt OCR on a page image at 200 DPI using Tesseract.

    Args:
        page: PyMuPDF Page object.

    Returns:
        Extracted OCR string if successful, or None if OCR is not available.
    """
    text, _ = ocr_page_tesseract(page, dpi=200)
    return text


def extract_pages(
    file_path: str | Path,
    max_pages: int = MAX_PAGE_COUNT,
    max_size_bytes: int = MAX_FILE_SIZE_BYTES,
    client: BaseLLMClient | None = None,
    ocr_mode: str | None = None,
    start_time: float | None = None,
    total_time_budget: float | None = None,
) -> list[dict[str, Any]]:
    """Extract normalized text per page from a PDF document with optional OCR fallback.

    Args:
        file_path: Path to target PDF file.
        max_pages: Maximum allowable page count.
        max_size_bytes: Maximum permitted file size in bytes.
        client: Optional BaseLLMClient for gemini_vision OCR fallback.
        ocr_mode: Optional OCR mode ('off' | 'tesseract' | 'gemini_vision'). Defaults to env OCR_MODE.
        start_time: Pipeline start timestamp for budget accounting.
        total_time_budget: Total time budget limit in seconds.

    Returns:
        List of dicts: {page_number (1-indexed), text, method ("text" | "ocr" | "unreadable"), char_count}

    Raises:
        ExtractionError: Plain-language user error for non-PDF, missing, corrupt,
            encrypted, empty, or oversized documents.
    """
    path = Path(file_path)

    # 1. File extension check
    if path.suffix.lower() != ".pdf":
        raise ExtractionInvalidFormatError(
            f"Unsupported file format '{path.suffix}'. Notice to Action accepts PDF documents only."
        )

    # 2. Path existence
    if not path.exists():
        raise ExtractionFileNotFoundError(f"Notice file not found at: '{file_path}'.")

    # 3. File size check
    try:
        file_size = path.stat().st_size
    except OSError as err:
        raise ExtractionError(f"Unable to read file metadata: {err}") from None

    if file_size == 0:
        raise ExtractionError("The PDF file is completely empty (0 bytes).")

    if file_size > max_size_bytes:
        size_mb = round(file_size / (1024 * 1024), 2)
        limit_mb = round(max_size_bytes / (1024 * 1024))
        raise ExtractionError(
            f"File size ({size_mb} MB) exceeds the maximum permitted limit of {limit_mb} MB."
        )

    # 4. Open document with PyMuPDF
    try:
        doc = pymupdf.open(path)
    except Exception:
        raise ExtractionError(
            "The PDF file appears to be corrupted, damaged, or malformed and could not be opened."
        ) from None

    try:
        # 5. Encryption / password protection check
        if doc.is_encrypted or doc.needs_pass:
            raise ExtractionError(
                "The PDF file is encrypted or password-protected. Please remove the password and re-upload."
            )

        # 6. Page count checks
        page_count = len(doc)
        if page_count == 0:
            raise ExtractionError("The PDF document contains no pages.")

        if page_count > max_pages:
            raise ExtractionError(
                f"Document contains {page_count} pages, which exceeds the maximum limit of {max_pages} pages."
            )

        active_ocr_mode = (ocr_mode or get_ocr_mode()).lower().strip()
        max_vision_pages = int(os.getenv("OCR_GEMINI_MAX_PAGES", str(DEFAULT_GEMINI_MAX_PAGES)))
        vision_pages_count = 0

        pages: list[dict[str, Any]] = []

        for page_idx in range(page_count):
            page_num = page_idx + 1
            page = doc[page_idx]

            # Extract digital vector text
            raw_text = page.get_text("text") or ""
            cleaned_text = normalize_whitespace(raw_text)

            if len(cleaned_text.strip()) >= MIN_USABLE_CHAR_COUNT:
                # Digital text present: never run OCR on pages that already have usable text
                pages.append(
                    {
                        "page_number": page_num,
                        "text": cleaned_text,
                        "display_text": cleaned_text,
                        "method": "text",
                        "char_count": len(cleaned_text),
                        "status": "ok",
                    }
                )
            else:
                # Scanned or image-only page lacking usable digital text
                if active_ocr_mode == "off":
                    pages.append(
                        {
                            "page_number": page_num,
                            "text": "",
                            "method": "unreadable",
                            "char_count": 0,
                            "status": "needs a clearer document",
                        }
                    )
                elif active_ocr_mode == "tesseract":
                    ocr_text, err = ocr_page_tesseract(page, dpi=DEFAULT_TESSERACT_DPI)
                    if ocr_text:
                        is_usable, reason = check_ocr_quality(ocr_text)
                        if is_usable:
                            cleaned_ocr = normalize_whitespace(ocr_text)
                            repaired_ocr = repair_ocr_spacing(cleaned_ocr)
                            pages.append(
                                {
                                    "page_number": page_num,
                                    "text": cleaned_ocr,
                                    "display_text": repaired_ocr,
                                    "method": "ocr",
                                    "char_count": len(cleaned_ocr),
                                    "status": "ok",
                                }
                            )
                        else:
                            pages.append(
                                {
                                    "page_number": page_num,
                                    "text": "",
                                    "method": "unreadable",
                                    "char_count": 0,
                                    "status": "needs a clearer document",
                                    "ocr_error": reason,
                                }
                            )
                    else:
                        pages.append(
                            {
                                "page_number": page_num,
                                "text": "",
                                "method": "unreadable",
                                "char_count": 0,
                                "status": "needs a clearer document",
                                "ocr_error": err or "Tesseract extraction returned empty output.",
                            }
                        )
                elif active_ocr_mode == "gemini_vision":
                    if vision_pages_count >= max_vision_pages:
                        cap_msg = (
                            f"OCR page limit reached (max {max_vision_pages} pages). "
                            "Remaining scanned pages were skipped."
                        )
                        pages.append(
                            {
                                "page_number": page_num,
                                "text": "",
                                "method": "unreadable",
                                "char_count": 0,
                                "status": "needs a clearer document",
                                "ocr_cap_hit": True,
                                "ocr_error": cap_msg,
                            }
                        )
                    else:
                        # Check time budget against pipeline total timeout
                        if start_time is not None and total_time_budget is not None:
                            if time.perf_counter() - start_time >= total_time_budget:
                                pages.append(
                                    {
                                        "page_number": page_num,
                                        "text": "",
                                        "method": "unreadable",
                                        "char_count": 0,
                                        "status": "needs a clearer document",
                                        "ocr_error": "Document processing exceeded total time budget.",
                                    }
                                )
                                continue

                        vision_pages_count += 1
                        v_client = client or get_llm_client()
                        ocr_text, err = ocr_page_gemini_vision(page, v_client, dpi=DEFAULT_GEMINI_DPI)
                        if ocr_text:
                            is_usable, reason = check_ocr_quality(ocr_text)
                            if is_usable:
                                cleaned_ocr = normalize_whitespace(ocr_text)
                                repaired_ocr = repair_ocr_spacing(cleaned_ocr)
                                pages.append(
                                    {
                                        "page_number": page_num,
                                        "text": cleaned_ocr,
                                        "display_text": repaired_ocr,
                                        "method": "ocr",
                                        "char_count": len(cleaned_ocr),
                                        "status": "ok",
                                    }
                                )
                            else:
                                pages.append(
                                    {
                                        "page_number": page_num,
                                        "text": "",
                                        "method": "unreadable",
                                        "char_count": 0,
                                        "status": "needs a clearer document",
                                        "ocr_error": reason,
                                    }
                                )
                        else:
                            pages.append(
                                {
                                    "page_number": page_num,
                                    "text": "",
                                    "method": "unreadable",
                                    "char_count": 0,
                                    "status": "needs a clearer document",
                                    "ocr_error": err or "Gemini vision extraction returned empty output.",
                                }
                            )
                else:
                    logger.warning(
                        "Unknown OCR_MODE '%s'. Defaulting to off (unreadable).", active_ocr_mode
                    )
                    pages.append(
                        {
                            "page_number": page_num,
                            "text": "",
                            "method": "unreadable",
                            "char_count": 0,
                            "status": "needs a clearer document",
                        }
                    )

        return pages

    finally:
        doc.close()


def check_document_readability(pages: list[dict[str, Any]]) -> dict[str, Any]:
    """Assess overall document readability status based on page extraction methods.

    Args:
        pages: List of extracted page dictionaries.

    Returns:
        Dict containing status ("good" | "needs a clearer document"), readable_page_count,
        unreadable_page_count, and unreadable_page_numbers list.
    """
    total = len(pages)
    if total == 0:
        return {
            "status": "needs a clearer document",
            "is_readable": False,
            "readable_pages": 0,
            "unreadable_pages": 0,
            "unreadable_page_numbers": [],
        }

    unreadable_page_numbers = [p["page_number"] for p in pages if p.get("method") == "unreadable"]
    readable_count = total - len(unreadable_page_numbers)

    # Document is completely unreadable only if zero pages could be read
    if readable_count == 0:
        return {
            "status": "needs a clearer document",
            "is_readable": False,
            "readable_pages": 0,
            "unreadable_pages": total,
            "unreadable_page_numbers": unreadable_page_numbers,
        }

    return {
        "status": "good",
        "is_readable": True,
        "readable_pages": readable_count,
        "unreadable_pages": len(unreadable_page_numbers),
        "unreadable_page_numbers": unreadable_page_numbers,
    }


def process_pdf(file_path: str | Path) -> dict[str, Any]:
    """Process a PDF notice file, extracting pages and returning schema-compliant dictionary.

    Args:
        file_path: Path to the target PDF notice file.

    Returns:
        Structured dictionary conforming to schemas/notice_output.schema.json.
    """
    path = Path(file_path)
    pages = extract_pages(path)
    readability = check_document_readability(pages)

    # Import classifier dynamically to avoid circular dependencies
    from extraction.classifier import classify_notice

    all_text = " ".join(p["text"] for p in pages if p["text"])
    classification = classify_notice(all_text)

    doc_quality = "good" if readability["status"] == "good" else "poor_scan"

    return {
        "notice_id": f"notice-{path.stem}",
        "schema_version": "1.0",
        "category": classification["category"],
        "notice_title": {
            "text": f"Notice: {path.stem}",
            "evidence_quote": None,
            "source_page": None,
            "status": "not_found",
        },
        "issuing_organisation": {
            "text": "Official Issuing Authority",
            "evidence_quote": None,
            "source_page": None,
            "status": "not_found",
        },
        "affected_party": {
            "text": "Concerned Citizens / Recipients",
            "evidence_quote": None,
            "source_page": None,
            "status": "not_found",
        },
        "main_purpose": {
            "text": "Notice compliance requirements and action timeline",
            "evidence_quote": None,
            "source_page": None,
            "status": "not_found",
        },
        "plain_language_summary": {
            "what_is_this": "Official circular and instructions.",
            "why_it_matters": "Requires timely compliance to prevent service disruption or forfeiture.",
            "what_to_do": "Review checklist documents and submit required verification dossiers.",
            "where_to_do_it": "Official portal or issuing authority office.",
            "if_deadline_missed": "Late fee or operational restrictions may apply.",
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
        "needs_verification": readability["status"] != "good",
        "document_quality": doc_quality,
        "extracted_at": "2026-10-22T20:00:00Z",
    }
