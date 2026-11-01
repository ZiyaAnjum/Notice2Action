"""End-to-end extraction and processing pipeline for Notice to Action.

Flow:
1. extract_pages: Extract page-by-page text from PDF.
2. check_document_readability: Refuse unreadable/scanned-only documents without calling LLM.
3. classify_notice: Refuse out-of-scope documents without calling LLM.
4. extract_notice_with_llm: Structured LLM extraction with self-repair retry loop.
5. validate_notice: Schema compliance and verbatim evidence quote verification.
6. post_process_notice: Verifies quote grounding, validates dates, marks unverified items
   as uncertain with warnings, and sets needs_verification flag.
"""

import logging
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from extraction.classifier import classify_notice
from extraction.extractor import (
    ExtractionError,
    check_document_readability,
    extract_pages,
)
from extraction.llm_client import (
    FRIENDLY_BUSY_MESSAGE,
    RETRYABLE_STATUS_CODES,
    BaseLLMClient,
    sanitize_message,
)
from extraction.llm_extractor import PROMPT_VERSION, extract_notice_with_llm
from validation.validator import normalize_text, validate_notice

logger = logging.getLogger(__name__)


def parse_date_string(date_str: str | None) -> tuple[bool, bool, str | None]:
    """Parse date string to determine if it is standard ISO, relative/unclear, or sentinel.

    Args:
        date_str: Raw date value from extracted notice.

    Returns:
        (is_valid_calendar_date, is_relative, parsed_iso_string)
    """
    if not date_str or date_str in ("not_found", "uncertain"):
        return True, False, date_str

    cleaned = date_str.strip()

    # 1. ISO format: YYYY-MM-DD
    try:
        parsed_d = date.fromisoformat(cleaned)
        return True, False, parsed_d.isoformat()
    except ValueError:
        pass

    # 2. ISO datetime: YYYY-MM-DDTHH:MM:SS
    try:
        parsed_dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        return True, False, parsed_dt.date().isoformat()
    except ValueError:
        pass

    # Strip ordinal suffixes (1st, 2nd, 3rd, 18th, etc.) from day numbers
    normalized = re.sub(r"\b(\d{1,2})(?:st|nd|rd|th)\b", r"\1", cleaned, flags=re.IGNORECASE)
    # Normalize punctuation and excess whitespace
    normalized = re.sub(r"[,]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # 3. Numeric dates: DD/MM/YYYY and DD-MM-YYYY
    # NOTE: Day first (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY) is the standard Indian administrative convention.
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            dt = datetime.strptime(normalized, fmt)
            return True, False, dt.date().isoformat()
        except ValueError:
            pass

    # 4. Textual month formats: "18 November 2026", "18 Nov 2026", "November 18 2026", "Nov 18 2026"
    for fmt in (
        "%d %B %Y",
        "%d %b %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%d-%b-%Y",
        "%d-%B-%Y",
    ):
        try:
            dt = datetime.strptime(normalized, fmt)
            return True, False, dt.date().isoformat()
        except ValueError:
            pass

    # 5. Check if it is really a relative date (e.g. "within 7 days of the due date")
    relative_pattern = (
        r"\b(within|after|before|prior to|from|of)\b.*\b(days?|weeks?|months?|receipt|issuance|due\s+date|notice|circular)\b"
        r"|\bwithin\b"
    )
    if re.search(relative_pattern, cleaned, re.IGNORECASE):
        return False, True, None

    # Unparseable, but not a recognized relative date
    return False, False, None


def post_process_notice(
    notice: dict[str, Any],
    pages: list[dict[str, Any]],
    validation_report: dict[str, Any],
) -> dict[str, Any]:
    """Inspect and enforce evidence grounding and deadline parsing rules.

    Any critical item whose evidence_quote is not found verbatim in page text is
    marked 'uncertain' with an explicit warning and triggers needs_verification=True.
    Relative dates, conflicting multiple dates, or unparseable dates are flagged.

    Args:
        notice: Extracted notice dictionary.
        pages: Extracted page dictionaries.
        validation_report: Validation result dictionary from validate_notice.

    Returns:
        Grounded and post-processed notice dictionary.
    """
    notice_copy = dict(notice)
    normalized_pages = [normalize_text(p.get("text", "")) for p in pages]
    total_pages = len(normalized_pages)

    warnings: list[dict[str, Any]] = list(notice_copy.get("warnings") or [])

    def verify_field_quote(field_data: Any, field_name: str) -> None:
        """Verify evidence quote is present verbatim on the referenced source page."""
        if not isinstance(field_data, dict):
            return

        quote = field_data.get("evidence_quote")
        page = field_data.get("source_page")

        # Skip explicit not_found / uncertain markers
        if quote in ("not_found", "uncertain", None) or page in ("not_found", "uncertain", None):
            return

        # Check page bounds
        if not (type(page) is int and 1 <= page <= total_pages):
            field_data["status"] = "uncertain"
            notice_copy["needs_verification"] = True
            warnings.append(
                {
                    "code": "GROUNDING_INVALID_PAGE",
                    "warning_text": f"Grounding warning: Field '{field_name}' references page {page}, "
                    f"but notice has {total_pages} page(s).",
                    "severity": "critical",
                    "evidence_quote": str(quote)[:100] if quote else None,
                    "source_page": page if type(page) is int else None,
                }
            )
            return

        # Check verbatim quote grounding
        norm_quote = normalize_text(str(quote))
        page_text = normalized_pages[page - 1]

        if norm_quote not in page_text:
            field_data["status"] = "uncertain"
            notice_copy["needs_verification"] = True
            warnings.append(
                {
                    "code": "GROUNDING_UNVERIFIED_QUOTE",
                    "warning_text": f"Grounding warning: Verbatim quote for '{field_name}' not found on page {page}.",
                    "severity": "warning",
                    "evidence_quote": str(quote)[:100],
                    "source_page": page,
                }
            )

    # 1. Verify top-level critical fields
    for field_name in ("notice_title", "issuing_organisation", "affected_party", "main_purpose"):
        field_val = notice_copy.get(field_name)
        if isinstance(field_val, dict):
            verify_field_quote(field_val, field_name)

    # 2. Verify submission channel
    sub_chan = notice_copy.get("submission_channel")
    if isinstance(sub_chan, dict):
        verify_field_quote(sub_chan, "submission_channel")

    # 3. Verify and parse deadlines
    parsed_calendar_deadlines: list[dict[str, Any]] = []

    for idx, dl in enumerate(notice_copy.get("deadlines") or []):
        if not isinstance(dl, dict):
            continue

        label = dl.get("description") or f"deadline_{idx + 1}"
        verify_field_quote(dl, f"deadline: {label}")

        raw_date = dl.get("date")
        is_cal, is_relative, iso_str = parse_date_string(raw_date)

        if is_relative:
            dl["is_ambiguous_or_conflicting"] = True
            if not dl.get("ambiguity_reason"):
                dl["ambiguity_reason"] = (
                    f"Date '{raw_date}' is a relative deadline requiring a reference date to calculate."
                )
            dl["status"] = "ambiguous"
            notice_copy["needs_verification"] = True
            warnings.append(
                {
                    "code": "DEADLINE_RELATIVE",
                    "warning_text": f"Deadline '{label}' contains relative date '{raw_date}'.",
                    "severity": "warning",
                    "evidence_quote": dl.get("evidence_quote"),
                    "source_page": dl.get("source_page"),
                }
            )
        elif not is_cal:
            dl["is_ambiguous_or_conflicting"] = True
            if not dl.get("ambiguity_reason"):
                dl["ambiguity_reason"] = (
                    f"Date '{raw_date}' could not be parsed as a calendar date."
                )
            dl["status"] = "ambiguous"
            notice_copy["needs_verification"] = True
            warnings.append(
                {
                    "code": "DEADLINE_UNPARSEABLE",
                    "warning_text": f"Deadline '{label}' contains unparseable date '{raw_date}'.",
                    "severity": "warning",
                    "evidence_quote": dl.get("evidence_quote"),
                    "source_page": dl.get("source_page"),
                }
            )
        elif iso_str and iso_str not in ("not_found", "uncertain"):
            # Successfully parsed calendar date! Normalize date to standard ISO format
            dl["date"] = iso_str
            parsed_calendar_deadlines.append(dl)

    # Check for multiple different absolute dates for related obligations
    distinct_dates = {d["date"] for d in parsed_calendar_deadlines if d.get("date")}
    if len(distinct_dates) >= 2:
        parts = [
            f"{d.get('date')} for '{d.get('description', 'obligation')}'"
            for d in parsed_calendar_deadlines
        ]
        conflict_reason = f"Multiple deadline dates for related obligations: {' vs '.join(parts)}"
        for dl in parsed_calendar_deadlines:
            dl["is_ambiguous_or_conflicting"] = True
            dl["ambiguity_reason"] = conflict_reason
            dl["status"] = "conflicting"

        notice_copy["needs_verification"] = True
        warnings.append(
            {
                "code": "DEADLINE_CONFLICTING_DATES",
                "warning_text": conflict_reason,
                "severity": "warning",
                "evidence_quote": None,
                "source_page": None,
            }
        )

    # 4. Verify required documents
    for doc in notice_copy.get("required_documents") or []:
        if isinstance(doc, dict):
            verify_field_quote(doc, f"required_document: {doc.get('name', 'unnamed')}")

    # 5. Verify action steps
    for step in notice_copy.get("action_steps") or []:
        if isinstance(step, dict):
            verify_field_quote(step, f"action_step: {step.get('order', '?')}")

    # 6. Verify penalties
    for pen in notice_copy.get("penalties") or []:
        if isinstance(pen, dict):
            verify_field_quote(pen, f"penalty: {pen.get('description', 'unnamed')}")
            # Ensure penalties with no stated amount use "not_found", not None
            if pen.get("amount") is None:
                pen["amount"] = "not_found"

    # If any warnings exist or validation report had errors, set needs_verification
    if len(warnings) > 0 or not validation_report.get("is_valid"):
        notice_copy["needs_verification"] = True

    notice_copy["warnings"] = warnings
    return notice_copy


def process_notice(
    file_path: str | Path,
    client: BaseLLMClient | None = None,
) -> dict[str, Any]:
    """Execute the complete end-to-end notice processing pipeline.

    Flow:
    1. Extract page texts from PDF.
    2. Check document readability; refuse unreadable/scanned docs without calling LLM.
    3. Classify document; refuse out-of-scope documents without calling LLM.
    4. Call LLM structured extraction with self-repair retry loop.
    5. Validate schema and evidence quote grounding.
    6. Post-process to ground unverified quotes, validate dates, and flag warnings.

    Args:
        file_path: Path to target PDF file.
        client: Optional BaseLLMClient implementation for dependency injection in tests.

    Returns:
        Structured result dict:
        {status, category, result, validation_report, needs_verification, message, prompt_version}
    """
    path = Path(file_path)

    # Step 1: Extract pages
    try:
        pages = extract_pages(path)
    except ExtractionError as err:
        return {
            "status": "needs_clearer_document",
            "category": "other_out_of_scope",
            "result": None,
            "validation_report": {
                "is_valid": False,
                "schema_compliant": False,
                "errors": [err.message],
                "warnings": [],
            },
            "needs_verification": True,
            "message": f"Document could not be processed: {err.message}",
        }

    # Step 2: Refusal Check - Readability / Image-only Scans (NO LLM CALL)
    readability = check_document_readability(pages)
    if readability["readable_pages"] == 0 or readability["status"] == "needs a clearer document":
        return {
            "status": "needs_clearer_document",
            "category": "other_out_of_scope",
            "result": None,
            "validation_report": {
                "is_valid": False,
                "schema_compliant": False,
                "errors": [
                    "Document contains no usable digital text (scanned or image-only without OCR)."
                ],
                "warnings": [],
            },
            "needs_verification": True,
            "message": "The uploaded document contains unreadable or scanned pages without usable text. "
            "Please provide a clearer digital PDF document.",
        }

    # Step 3: Refusal Check - Out-of-Scope Classification (NO LLM CALL)
    classification = classify_notice(pages)
    category = classification["category"]

    if category == "other_out_of_scope":
        return {
            "status": "out_of_scope",
            "category": "other_out_of_scope",
            "result": None,
            "validation_report": {
                "is_valid": False,
                "schema_compliant": False,
                "errors": ["Document is outside the 5 supported official notice categories."],
                "warnings": [],
            },
            "needs_verification": False,
            "message": "This document is not an official notice within the supported categories "
            "(scholarship_or_college, bank, utility, tax_or_payment, government_scheme).",
        }

    # Step 4: LLM Structured Extraction
    extraction_res = extract_notice_with_llm(pages, category, client=client)

    if extraction_res["status"] != "success" or not extraction_res["data"]:
        is_busy = extraction_res.get("is_busy", False)
        status_code = extraction_res.get("status_code")
        raw_error = extraction_res.get("error") or "LLM extraction failed."
        safe_error = sanitize_message(raw_error)

        if is_busy or (status_code in RETRYABLE_STATUS_CODES):
            user_message = FRIENDLY_BUSY_MESSAGE
            logger.error(
                "Pipeline extraction failed due to temporary AI service error: %s (status=%s)",
                safe_error,
                status_code,
            )
        else:
            user_message = f"Structured extraction failed: {safe_error}"
            logger.error(
                "Pipeline extraction failed: %s (status=%s)",
                safe_error,
                status_code,
            )

        return {
            "status": "extraction_failed",
            "category": category,
            "result": None,
            "validation_report": {
                "is_valid": False,
                "schema_compliant": False,
                "errors": [user_message],
                "warnings": [],
            },
            "needs_verification": True,
            "message": user_message,
        }

    extracted_data = extraction_res["data"]

    # Step 5: Schema and Evidence Grounding Validation
    page_texts = [p.get("text", "") for p in pages]
    validation_report = validate_notice(extracted_data, page_texts=page_texts)

    # Step 6: Post-processing verification and date parsing
    grounded_notice = post_process_notice(extracted_data, pages, validation_report)

    # Update document_quality based on readability
    grounded_notice["document_quality"] = "good" if readability["status"] == "good" else "poor_scan"

    needs_verification = grounded_notice.get("needs_verification", False)
    if needs_verification:
        status_message = (
            "Notice processed. Please check the highlighted items against your original notice."
        )
    else:
        status_message = "Notice processed and verified successfully."

    return {
        "status": "success",
        "category": category,
        "result": grounded_notice,
        "validation_report": validation_report,
        "needs_verification": needs_verification,
        "message": status_message,
        "prompt_version": PROMPT_VERSION,
    }
