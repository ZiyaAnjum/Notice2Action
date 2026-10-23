"""PDF text extraction pipeline for Notice to Action.

Uses PyMuPDF (fitz) for fast, robust page-by-page text extraction with
whitespace normalization and optional fallback to OCR when images lack text.
"""

import io
import shutil
from pathlib import Path
from typing import Any

import pymupdf

from validation.validator import normalize_whitespace

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
    """Attempt OCR on a page image using pytesseract if library and binary exist.

    Args:
        page: PyMuPDF Page object.

    Returns:
        Extracted OCR string if successful, or None if OCR is not available.
    """
    try:
        import pytesseract
        from PIL import Image

        # Ensure tesseract system binary is on PATH
        if not shutil.which("tesseract"):
            return None

        # Render page to raster pixmap for OCR
        pix = page.get_pixmap(dpi=150)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        ocr_text = pytesseract.image_to_string(img)
        return ocr_text
    except Exception:
        # Pytesseract not installed, tesseract binary missing, or OCR failure
        return None


def extract_pages(
    file_path: str | Path,
    max_pages: int = MAX_PAGE_COUNT,
    max_size_bytes: int = MAX_FILE_SIZE_BYTES,
) -> list[dict[str, Any]]:
    """Extract normalized text per page from a PDF document.

    Args:
        file_path: Path to target PDF file.
        max_pages: Maximum allowable page count.
        max_size_bytes: Maximum permitted file size in bytes.

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

        pages: list[dict[str, Any]] = []

        for page_idx in range(page_count):
            page_num = page_idx + 1
            page = doc[page_idx]

            # Extract digital vector text
            raw_text = page.get_text("text") or ""
            cleaned_text = normalize_whitespace(raw_text)

            if len(cleaned_text.strip()) >= MIN_USABLE_CHAR_COUNT:
                pages.append(
                    {
                        "page_number": page_num,
                        "text": cleaned_text,
                        "method": "text",
                        "char_count": len(cleaned_text),
                        "status": "ok",
                    }
                )
            else:
                # Page has no usable digital text: attempt OCR fallback if available
                ocr_text = try_ocr_page(page)
                if (
                    ocr_text
                    and len(normalize_whitespace(ocr_text).strip()) >= MIN_USABLE_CHAR_COUNT
                ):
                    cleaned_ocr = normalize_whitespace(ocr_text)
                    pages.append(
                        {
                            "page_number": page_num,
                            "text": cleaned_ocr,
                            "method": "ocr",
                            "char_count": len(cleaned_ocr),
                            "status": "ok",
                        }
                    )
                else:
                    # OCR unavailable or failed: mark as unreadable without crashing
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
        and unreadable_page_count.
    """
    total = len(pages)
    if total == 0:
        return {
            "status": "needs a clearer document",
            "is_readable": False,
            "readable_pages": 0,
            "unreadable_pages": 0,
        }

    unreadable_count = sum(1 for p in pages if p.get("method") == "unreadable")
    readable_count = total - unreadable_count

    if unreadable_count > 0:
        return {
            "status": "needs a clearer document",
            "is_readable": readable_count > 0,
            "readable_pages": readable_count,
            "unreadable_pages": unreadable_count,
        }

    return {
        "status": "good",
        "is_readable": True,
        "readable_pages": readable_count,
        "unreadable_pages": 0,
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
