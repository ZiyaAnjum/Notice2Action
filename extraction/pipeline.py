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
import time
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
from extraction.triage import (
    RULE_BASED_CONFIDENCE_THRESHOLD,
    triage_notice,
)
from validation.validator import (
    TESTED_CATEGORIES,
    normalize_text,
    validate_notice,
)

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

    user_warnings: list[dict[str, Any]] = []
    technical_notes: list[dict[str, Any]] = list(notice_copy.get("technical_notes") or [])

    # Filter out any technical checks that were previously stored in warnings
    for w in notice_copy.get("warnings") or []:
        if isinstance(w, dict) and w.get("code") in (
            "GROUNDING_ELLIPSIS_QUOTE",
            "GROUNDING_INVALID_PAGE",
            "GROUNDING_UNVERIFIED_QUOTE",
            "DEADLINE_RELATIVE",
            "DEADLINE_UNPARSEABLE",
            "DEADLINE_CONFLICTING_DATES",
            "DOCUMENT_CONDITIONAL_OR_ALTERNATIVE",
        ):
            technical_notes.append(w)
        else:
            user_warnings.append(w)

    def verify_field_quote(field_data: Any, field_name: str) -> None:
        """Verify evidence quote is present verbatim on the referenced source page."""
        if not isinstance(field_data, dict):
            return

        quote = field_data.get("evidence_quote")
        page = field_data.get("source_page")

        # Skip explicit not_found / uncertain markers
        if quote in ("not_found", "uncertain", None) or page in ("not_found", "uncertain", None):
            return

        # Treat quotes containing ellipsis "..." as ungrounded (non-contiguous)
        if isinstance(quote, str) and "..." in quote:
            field_data["status"] = "uncertain"
            notice_copy["needs_verification"] = True
            msg = (
                f"Grounding warning: Quote for '{field_name}' contains ellipsis '...' "
                "and is not a single contiguous passage."
            )
            logger.warning("%s (code=GROUNDING_ELLIPSIS_QUOTE)", msg)
            technical_notes.append(
                {
                    "code": "GROUNDING_ELLIPSIS_QUOTE",
                    "note": msg,
                    "warning_text": msg,
                    "severity": "warning",
                    "evidence_quote": str(quote)[:100],
                    "source_page": page if type(page) is int else None,
                }
            )
            return

        # Check page bounds
        if not (type(page) is int and 1 <= page <= total_pages):
            field_data["status"] = "uncertain"
            notice_copy["needs_verification"] = True
            msg = (
                f"Grounding warning: Field '{field_name}' references page {page}, "
                f"but notice has {total_pages} page(s)."
            )
            logger.warning("%s (code=GROUNDING_INVALID_PAGE)", msg)
            technical_notes.append(
                {
                    "code": "GROUNDING_INVALID_PAGE",
                    "note": msg,
                    "warning_text": msg,
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
            msg = f"Grounding warning: Verbatim quote for '{field_name}' not found on page {page}."
            logger.warning(
                "%s (code=GROUNDING_UNVERIFIED_QUOTE, quote='%s')", msg, str(quote)[:100]
            )
            technical_notes.append(
                {
                    "code": "GROUNDING_UNVERIFIED_QUOTE",
                    "note": msg,
                    "warning_text": msg,
                    "severity": "warning",
                    "evidence_quote": str(quote)[:100],
                    "source_page": page,
                }
            )

    # 0. Normalize plain_language_summary parts to plain strings and retain evidence separately
    summary = notice_copy.get("plain_language_summary")
    if isinstance(summary, dict):
        summary_evidence: dict[str, Any] = {}
        for key in (
            "what_is_this",
            "why_it_matters",
            "what_to_do",
            "where_to_do_it",
            "if_deadline_missed",
        ):
            val = summary.get(key)
            if isinstance(val, dict):
                text_val = val.get("text")
                summary[key] = str(text_val) if text_val is not None else ""
                ev_quote = val.get("evidence_quote")
                src_page = val.get("source_page")
                if ev_quote or src_page:
                    summary_evidence[key] = {
                        "evidence_quote": ev_quote,
                        "source_page": src_page,
                    }
        if summary_evidence:
            notice_copy["plain_language_summary_evidence"] = summary_evidence

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

        # Infer or preserve deadline role
        raw_role = dl.get("role")
        if raw_role in ("primary", "extended", "consequence", "other"):
            role = raw_role
        elif is_relative or (raw_date and "within" in str(raw_date).lower()):
            role = "consequence"
        elif (
            any(
                kw in f"{label} {dl.get('evidence_quote', '')}".lower()
                for kw in (
                    "extended",
                    "with late fee",
                    "with fine",
                    "with surcharge",
                    "late fee",
                    "after due date",
                )
            )
            and "without" not in f"{label}".lower()
        ):
            role = "extended"
        else:
            role = "primary"
        dl["role"] = role

        if is_relative:
            dl["is_ambiguous_or_conflicting"] = True
            if not dl.get("ambiguity_reason"):
                dl["ambiguity_reason"] = (
                    f"Date '{raw_date}' is a relative deadline requiring a reference date to calculate."
                )
            dl["status"] = "uncertain"
            notice_copy["needs_verification"] = True
            msg = f"Deadline '{label}' contains relative date '{raw_date}'."
            logger.warning("%s (code=DEADLINE_RELATIVE)", msg)
            technical_notes.append(
                {
                    "code": "DEADLINE_RELATIVE",
                    "note": msg,
                    "warning_text": msg,
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
            msg = f"Deadline '{label}' contains unparseable date '{raw_date}'."
            logger.warning("%s (code=DEADLINE_UNPARSEABLE)", msg)
            technical_notes.append(
                {
                    "code": "DEADLINE_UNPARSEABLE",
                    "note": msg,
                    "warning_text": msg,
                    "severity": "warning",
                    "evidence_quote": dl.get("evidence_quote"),
                    "source_page": dl.get("source_page"),
                }
            )
        elif iso_str and iso_str not in ("not_found", "uncertain"):
            # Successfully parsed calendar date! Normalize date to standard ISO format
            dl["date"] = iso_str
            parsed_calendar_deadlines.append(dl)

    # Check for conflicting dates: Two or more different primary dates for related obligations.
    # Staged deadlines (primary + extended) are NOT a conflict.
    primary_calendar_deadlines = [
        d for d in parsed_calendar_deadlines if d.get("role") == "primary"
    ]
    distinct_primary_dates = {d["date"] for d in primary_calendar_deadlines if d.get("date")}

    if len(distinct_primary_dates) >= 2:
        parts = [
            f"{d.get('date')} for {d.get('description', 'obligation')}"
            for d in primary_calendar_deadlines
        ]
        conflict_reason = (
            f"The notice gives two different dates ({', '.join(parts)}). "
            "Please check which one applies to you."
        )
        for dl in primary_calendar_deadlines:
            dl["is_ambiguous_or_conflicting"] = True
            dl["ambiguity_reason"] = conflict_reason
            dl["status"] = "conflicting"

        notice_copy["needs_verification"] = True
        logger.warning(
            "Deadline conflict detected: %s (code=DEADLINE_CONFLICTING_DATES)", conflict_reason
        )
        technical_notes.append(
            {
                "code": "DEADLINE_CONFLICTING_DATES",
                "note": conflict_reason,
                "warning_text": conflict_reason,
                "severity": "warning",
                "evidence_quote": None,
                "source_page": None,
            }
        )

    # When the notice states no deadline, if_deadline_missed summary must state so plainly
    all_deadlines = notice_copy.get("deadlines") or []
    has_stated_deadline = any(
        isinstance(dl, dict)
        and dl.get("date") not in ("not_found", None, "")
        and dl.get("status") != "not_found"
        for dl in all_deadlines
    )
    if not has_stated_deadline and isinstance(summary, dict):
        summary["if_deadline_missed"] = "The notice does not give a deadline."

    # 4. Verify required documents and filter conditional / alternative items
    cleaned_required_docs: list[dict[str, Any]] = []

    for doc in notice_copy.get("required_documents") or []:
        if not isinstance(doc, dict):
            continue

        doc_name = doc.get("name", "unnamed document")
        quote = str(doc.get("evidence_quote") or "")
        q_lower = quote.lower()
        name_lower = doc_name.lower()

        # Still never include conditional items ("if you have already paid...") or alternatives ("a self-declaration instead")
        is_conditional_or_alt = "if you" in q_lower or "instead" in q_lower

        if is_conditional_or_alt:
            notice_copy["needs_verification"] = True
            msg = (
                f"Document '{doc_name}' appears conditional or an alternative route "
                f"(quote: '{quote[:100]}') and was moved from required documents to technical notes for review."
            )
            logger.warning("%s (code=DOCUMENT_CONDITIONAL_OR_ALTERNATIVE)", msg)
            technical_notes.append(
                {
                    "code": "DOCUMENT_CONDITIONAL_OR_ALTERNATIVE",
                    "note": msg,
                    "warning_text": msg,
                    "severity": "warning",
                    "evidence_quote": doc.get("evidence_quote"),
                    "source_page": doc.get("source_page"),
                }
            )
            continue

        # Check if explicitly optional / recommended
        is_optional = (
            doc.get("is_required") is False
            or "optional" in q_lower
            or "recommended" in q_lower
            or "optional" in name_lower
            or "recommended" in name_lower
            or doc.get("label") == "Suggested, not required"
        )

        if is_optional:
            doc["is_required"] = False
            doc["label"] = "Suggested, not required"
        else:
            # Check for non-optional documents that might contain "may" (excluding 'May' as month name)
            has_may = False
            if re.search(r"\bmay\b", q_lower):
                stripped = re.sub(
                    r"(\b\d{1,2}\s+may\b|\bmay\s+\d{1,2}\b|\bmay\s+\d{4}\b)", "", q_lower
                )
                has_may = bool(re.search(r"\bmay\b", stripped))

            if has_may:
                notice_copy["needs_verification"] = True
                msg = (
                    f"Document '{doc_name}' appears conditional or an alternative route "
                    f"(quote: '{quote[:100]}') and was moved from required documents to technical notes for review."
                )
                logger.warning("%s (code=DOCUMENT_CONDITIONAL_OR_ALTERNATIVE)", msg)
                technical_notes.append(
                    {
                        "code": "DOCUMENT_CONDITIONAL_OR_ALTERNATIVE",
                        "note": msg,
                        "warning_text": msg,
                        "severity": "warning",
                        "evidence_quote": doc.get("evidence_quote"),
                        "source_page": doc.get("source_page"),
                    }
                )
                continue

        verify_field_quote(doc, f"required_document: {doc_name}")
        cleaned_required_docs.append(doc)

    notice_copy["required_documents"] = cleaned_required_docs

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

    # 7. Verify user-facing notice warnings
    for warn in user_warnings:
        if isinstance(warn, dict):
            verify_field_quote(
                warn,
                f"warning: {warn.get('warning_text') or warn.get('message') or 'unnamed'}",
            )

    # If any technical notes or warnings exist or validation report had errors, set needs_verification
    if len(technical_notes) > 0 or len(user_warnings) > 0 or not validation_report.get("is_valid"):
        notice_copy["needs_verification"] = True

    notice_copy["warnings"] = user_warnings
    notice_copy["technical_notes"] = technical_notes
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

    # Step 3: Two-step Triage (Fast Rule-based guess -> LLM triage if ambiguous or new category)
    rb_classification = classify_notice(pages)
    rb_category = rb_classification.get("category")
    rb_confidence = float(rb_classification.get("confidence", 0.0) or 0.0)

    triage_time_ms = 0
    triage_reason: str | None = None

    # Step 3a: Skip LLM triage if rule-based classifier is confident on a tested category
    if rb_category in TESTED_CATEGORIES and rb_confidence >= RULE_BASED_CONFIDENCE_THRESHOLD:
        category = rb_category
        trust_level = "tested"
        logger.info(
            "Rule-based classifier confident (cat=%s, conf=%.2f >= %.2f). Skipping LLM triage.",
            rb_category,
            rb_confidence,
            RULE_BASED_CONFIDENCE_THRESHOLD,
        )
    else:
        # Step 3b: Execute LLM triage on first 2 pages
        t0_triage = time.perf_counter()
        triage_res = triage_notice(pages, client=client)
        triage_time_ms = int((time.perf_counter() - t0_triage) * 1000)

        if triage_res["status"] == "success":
            triage_cat = triage_res["category"]
            is_actionable = triage_res["is_actionable_notice"]
            triage_reason = (
                triage_res.get("reason")
                or "Document could not be recognized as an actionable official notice."
            )

            logger.info(
                "LLM triage completed in %d ms (cat=%s, is_actionable=%s, conf=%.2f)",
                triage_time_ms,
                triage_cat,
                is_actionable,
                triage_res.get("confidence", 0.0),
            )

            if not is_actionable or triage_cat == "not_a_notice":
                # Refuse out-of-scope non-notices with plain-language explanation
                return {
                    "status": "out_of_scope",
                    "category": "other_out_of_scope",
                    "trust_level": None,
                    "result": None,
                    "validation_report": {
                        "is_valid": False,
                        "schema_compliant": False,
                        "errors": [triage_reason],
                        "warnings": [],
                    },
                    "needs_verification": False,
                    "message": f"This document cannot be processed as an actionable official notice. {triage_reason}",
                    "triage_time_ms": triage_time_ms,
                }
            elif triage_cat in TESTED_CATEGORIES:
                category = triage_cat
                trust_level = "tested"
            else:
                # Any other actionable category runs in general mode
                category = triage_cat
                trust_level = "general"
        else:
            # Triage call failed (timeout, invalid JSON, service busy): fall back to rule-based classifier
            logger.warning(
                "LLM triage failed (%s) after %d ms. Falling back to rule-based classification.",
                triage_res.get("error"),
                triage_time_ms,
            )
            if rb_category in TESTED_CATEGORIES:
                category = rb_category
                trust_level = "tested"
            else:
                return {
                    "status": "out_of_scope",
                    "category": "other_out_of_scope",
                    "trust_level": None,
                    "result": None,
                    "validation_report": {
                        "is_valid": False,
                        "schema_compliant": False,
                        "errors": [
                            "Document could not be identified as a supported official notice category."
                        ],
                        "warnings": [],
                    },
                    "needs_verification": False,
                    "message": "This document is not an official notice within the supported categories.",
                    "triage_time_ms": triage_time_ms,
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

    # Enforce general mode requirements
    if trust_level == "general":
        grounded_notice["needs_verification"] = True

    grounded_notice["trust_level"] = trust_level

    needs_verification = grounded_notice.get("needs_verification", False)
    if trust_level == "general":
        status_message = (
            "Notice processed in general mode. This type of notice is less tested. "
            "Please check every item against your original notice."
        )
    elif needs_verification:
        status_message = (
            "Notice processed. Please check the highlighted items against your original notice."
        )
    else:
        status_message = "Notice processed and verified successfully."

    return {
        "status": "success",
        "category": category,
        "trust_level": trust_level,
        "result": grounded_notice,
        "validation_report": validation_report,
        "needs_verification": needs_verification,
        "message": status_message,
        "prompt_version": PROMPT_VERSION,
        "technical_notes": grounded_notice.get("technical_notes", []),
        "triage_time_ms": triage_time_ms,
    }
