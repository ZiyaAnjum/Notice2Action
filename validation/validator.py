import copy
import json
import re
from pathlib import Path
from typing import Any

import jsonschema

# Canonical schema paths relative to this file's location to avoid CWD dependency
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "notice_output.schema.json"
LEGACY_SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "notice.schema.json"

# Canonical categories for tested vs general mode
TESTED_CATEGORIES = (
    "scholarship_or_college",
    "bank",
    "utility",
    "tax_or_payment",
    "government_scheme",
)

GENERAL_MODE_CATEGORIES = (
    "insurance_or_health",
    "legal_or_court",
    "employment",
    "other_official_notice",
)

# PRD-aligned valid categories defined in single canonical location
VALID_CATEGORIES = (
    *TESTED_CATEGORIES,
    *GENERAL_MODE_CATEGORIES,
    "other_out_of_scope",
)

LEGACY_CATEGORIES = (
    "scholarship",
    "bank",
    "utility",
    "tax",
    "govt_scheme",
    "unsupported",
)


def normalize_whitespace(text: str) -> str:
    """Normalize curly quotes to straight quotes and collapse whitespace while preserving case.

    Args:
        text: Raw string containing quotes or page text.

    Returns:
        Text with straight quotes and collapsed whitespace.
    """
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    return re.sub(r"\s+", " ", text).strip()


def normalize_text(text: str) -> str:
    """Normalize whitespace and quotation marks for robust evidence grounding.

    Args:
        text: Raw string containing quotes or page text.

    Returns:
        Lowercased text with straight quotes and collapsed whitespace.
    """
    return normalize_whitespace(text).lower()


def validate_v2_notice(
    notice: dict[str, Any],
    page_texts: list[str] | None = None,
    target_schema_path: Path | None = None,
) -> dict[str, Any]:
    """Validate Notice Decision Card (v2.0) with repair-and-degrade semantics (STEP 2).

    Rules:
    - Never fail the whole notice because of one bad field.
    - Drop or null the invalid field, record a warning, and return the rest.
    - Drop action steps with empty text and renumber remaining steps.
    - Verify evidence quotes against extracted page texts.
    - Return status: 'complete' | 'partial' | 'failed', with warnings[] naming dropped fields.
    - Only 'failed' if there is no usable text or no valid summary at all.
    - Even on 'failed', preserve raw_text_ref so the UI can still show text.
    """
    notice_copy: dict[str, Any] = copy.deepcopy(notice)
    warnings: list[str] = list(notice_copy.get("warnings") or [])
    errors: list[str] = []

    normalized_pages = [normalize_text(p) for p in page_texts] if page_texts is not None else []
    raw_text = "\n\n".join(page_texts) if page_texts is not None else str(notice_copy.get("raw_text_ref", ""))

    # 1. Headline Repair & Degrade
    if not isinstance(notice_copy.get("headline"), dict):
        warnings.append("Repaired invalid headline: initialized default structure.")
        notice_copy["headline"] = {
            "one_line_summary": notice_copy.get("summary_plain") or "Official notice.",
            "notice_type": notice_copy.get("category") or "official_notice",
            "source_organisation": "Official Authority",
            "amount_due": None,
            "primary_deadline_id": None,
            "urgency": "none",
        }
    else:
        h = notice_copy["headline"]
        if not h.get("one_line_summary"):
            h["one_line_summary"] = notice_copy.get("summary_plain") or "Official notice."
        if not h.get("notice_type"):
            h["notice_type"] = notice_copy.get("category") or "official_notice"
        if not h.get("source_organisation"):
            h["source_organisation"] = "Official Authority"
        if h.get("urgency") not in ("overdue", "urgent", "soon", "none"):
            h["urgency"] = "none"

        # Validate / repair amount_due: null if invalid
        amt_due = h.get("amount_due")
        if amt_due is not None:
            if not isinstance(amt_due, dict) or "amount" not in amt_due or "currency" not in amt_due:
                h["amount_due"] = None
                warnings.append("Dropped invalid field at 'headline.amount_due': expected object with amount and currency.")
            else:
                try:
                    h["amount_due"]["amount"] = float(amt_due["amount"])
                    h["amount_due"]["currency"] = str(amt_due["currency"]).upper()
                except (ValueError, TypeError):
                    h["amount_due"] = None
                    warnings.append("Dropped invalid field at 'headline.amount_due': non-numeric amount value.")

    # 2. Action Steps Repair: drop steps with empty text, re-number order 1..N
    raw_steps = notice_copy.get("action_steps")
    if not isinstance(raw_steps, list):
        warnings.append("Repaired action_steps: converted non-list to empty list.")
        raw_steps = []

    cleaned_steps: list[dict[str, Any]] = []
    for s in raw_steps:
        if not isinstance(s, dict):
            warnings.append("Dropped invalid non-dict action step.")
            continue
        s_text = str(s.get("text") or s.get("action") or s.get("instruction") or "").strip()
        if not s_text:
            warnings.append("Dropped invalid action step with empty or whitespace-only text.")
            continue
        ev = s.get("evidence")
        if not isinstance(ev, dict):
            ev = {"page": 1, "quote": "", "verified": False}
        cleaned_steps.append({
            "order": len(cleaned_steps) + 1,
            "text": s_text,
            "evidence": ev,
        })
    notice_copy["action_steps"] = cleaned_steps

    # 3. Deadlines Repair
    raw_deadlines = notice_copy.get("deadlines")
    if not isinstance(raw_deadlines, list):
        warnings.append("Repaired deadlines: converted non-list to empty list.")
        raw_deadlines = []

    cleaned_deadlines: list[dict[str, Any]] = []
    for dl in raw_deadlines:
        if not isinstance(dl, dict):
            warnings.append("Dropped invalid non-dict deadline item.")
            continue
        dl_id = dl.get("id") or f"dl-{len(cleaned_deadlines)+1}"
        dl_label = str(dl.get("label") or dl.get("description") or f"Deadline {len(cleaned_deadlines)+1}").strip()
        dl_kind = dl.get("kind")
        if dl_kind not in ("no_penalty_by", "due", "disconnection_risk", "other", "ambiguous"):
            dl_kind = "other"
        dl_date = dl.get("date")
        dl_date_type = dl.get("date_type")
        if dl_date_type not in ("exact", "estimated"):
            dl_date_type = "exact" if dl_date else "estimated"
        ev = dl.get("evidence")
        if not isinstance(ev, dict):
            ev = {"page": 1, "quote": "", "verified": False}
        cleaned_deadlines.append({
            "id": dl_id,
            "label": dl_label,
            "kind": dl_kind,
            "date": dl_date,
            "date_type": dl_date_type,
            "derived_from": dl.get("derived_from"),
            "evidence": ev,
        })
    notice_copy["deadlines"] = cleaned_deadlines

    # 4. Consequences Repair
    raw_consequences = notice_copy.get("consequences")
    if not isinstance(raw_consequences, list):
        warnings.append("Repaired consequences: converted non-list to empty list.")
        raw_consequences = []

    cleaned_consequences: list[dict[str, Any]] = []
    for c in raw_consequences:
        if not isinstance(c, dict):
            warnings.append("Dropped invalid non-dict consequence item.")
            continue
        c_label = str(c.get("label") or c.get("name") or "Consequence").strip()
        c_val = str(c.get("value") or c.get("amount") or c.get("description") or "").strip()
        ev = c.get("evidence")
        if not isinstance(ev, dict):
            ev = {"page": 1, "quote": "", "verified": False}
        cleaned_consequences.append({
            "label": c_label,
            "value": c_val,
            "evidence": ev,
        })
    notice_copy["consequences"] = cleaned_consequences

    # 5. Optional Arrays: omit key if empty
    for opt_key, item_req_key in [
        ("required_documents", "name"),
        ("where_to_submit", "channel"),
        ("conditions_that_apply", "condition"),
    ]:
        if opt_key in notice_copy:
            raw_items = notice_copy.get(opt_key)
            if not isinstance(raw_items, list) or not raw_items:
                del notice_copy[opt_key]
                continue
            cleaned_opt = []
            for item in raw_items:
                if isinstance(item, dict) and str(item.get(item_req_key) or "").strip():
                    ev = item.get("evidence")
                    if not isinstance(ev, dict):
                        ev = {"page": 1, "quote": "", "verified": False}
                    item["evidence"] = ev
                    cleaned_opt.append(item)
                else:
                    warnings.append(f"Dropped invalid item in '{opt_key}' missing required key '{item_req_key}'.")
            if cleaned_opt:
                notice_copy[opt_key] = cleaned_opt
            else:
                del notice_copy[opt_key]

    # 6. Evidence Quote Grounding Verification in Code
    quotes_checked = 0
    quotes_verified = 0

    collections = [
        notice_copy.get("deadlines") or [],
        notice_copy.get("action_steps") or [],
        notice_copy.get("consequences") or [],
        notice_copy.get("required_documents") or [],
        notice_copy.get("where_to_submit") or [],
        notice_copy.get("conditions_that_apply") or [],
    ]
    for coll in collections:
        for item in coll:
            if not isinstance(item, dict):
                continue
            ev = item.get("evidence")
            if not isinstance(ev, dict):
                continue
            quote = ev.get("quote")
            page = ev.get("page")
            if quote and str(quote).strip():
                quotes_checked += 1
                if normalized_pages and isinstance(page, int) and 1 <= page <= len(normalized_pages):
                    norm_q = normalize_text(str(quote))
                    if norm_q in normalized_pages[page - 1]:
                        quotes_verified += 1
                        ev["verified"] = True
                    else:
                        ev["verified"] = False
                        ev["needs_verification"] = True
                        label = item.get("label") or item.get("name") or item.get("text") or item.get("channel") or "item"
                        warnings.append(f"Evidence quote for '{label}' could not be verified verbatim on page {page}.")
                else:
                    ev["verified"] = False
                    ev["needs_verification"] = True
                    if page is not None and not (isinstance(page, int) and 1 <= page <= len(normalized_pages)):
                        warnings.append(f"Evidence quote references invalid page {page}.")

    # 7. Usable Text and Summary Check (Only 'failed' if no usable text or no valid summary)
    has_usable_text = bool(raw_text.strip()) or any(len(p.strip()) > 0 for p in (page_texts or []))
    summary_text = str(
        notice_copy.get("summary_plain")
        or (notice_copy.get("headline") or {}).get("one_line_summary")
        or ""
    ).strip()
    has_valid_summary = bool(summary_text)

    # Make sure raw_text_ref is present on notice_copy so UI can always view text
    if not notice_copy.get("raw_text_ref") and raw_text:
        notice_copy["raw_text_ref"] = raw_text[:2000]

    if not has_usable_text or not has_valid_summary:
        status = "failed"
        if not has_usable_text:
            errors.append("No usable text found in the uploaded document.")
        if not has_valid_summary:
            errors.append("No valid plain language summary could be generated.")
    elif warnings or not notice_copy.get("action_steps"):
        status = "partial"
    else:
        status = "complete"

    notice_copy["status"] = status
    notice_copy["warnings"] = warnings

    # Schema validation check against Draft202012
    schema_path = target_schema_path or SCHEMA_PATH
    try:
        with open(schema_path, encoding="utf-8") as f:
            schema_data = json.load(f)
        v = jsonschema.Draft202012Validator(schema_data)
        for err in v.iter_errors(notice_copy):
            # Record schema validation issues as warnings if we degraded
            if status != "failed":
                warnings.append(f"Schema notice at '{err.json_path}': {err.message}")
            else:
                errors.append(f"Schema validation error at '{err.json_path}': {err.message}")
    except Exception as e:
        if status == "failed":
            errors.append(f"Failed to check schema: {e}")

    grounded_ratio = (quotes_verified / quotes_checked) if quotes_checked > 0 else 1.0

    return {
        "is_valid": status != "failed",
        "schema_compliant": len(errors) == 0,
        "status": status,
        "quotes_checked": quotes_checked,
        "quotes_verified": quotes_verified,
        "grounded_ratio": round(grounded_ratio, 4),
        "unsupported_critical_count": 0,
        "errors": errors,
        "warnings": warnings,
        "notice": notice_copy,
    }


def validate_notice(
    notice: dict,
    page_texts: list[str] | None = None,
    schema_path: Path | None = None,
) -> dict:
    """Validate extracted notice against schema rules and check evidence grounding.

    Deep-copies the input notice at the start and returns a modified copy containing
    grounding status adjustments without mutating the caller's dictionary.

    Args:
        notice: Extracted notice dictionary to validate.
        page_texts: Optional list of raw string texts extracted per page (0-indexed list for pages 1..N).
        schema_path: Optional explicit Path to schema file. Defaults to SCHEMA_PATH,
            with automatic fallback to LEGACY_SCHEMA_PATH for legacy scaffold notices.

    Returns:
        Validation report dict with compliance status, evidence grounding score, errors,
        warnings, and the validated notice deep copy under 'notice'.
    """
    notice_copy: dict[str, Any] = copy.deepcopy(notice)

    errors: list[str] = []
    warnings: list[str] = []
    quotes_checked = 0
    quotes_verified = 0

    # Resolve schema path: respect explicit param, monkeypatched SCHEMA_PATH, or legacy fallback
    target_schema_path = schema_path or SCHEMA_PATH
    # If notice conforms to V2 (Decision Card) schema, use repair-and-degrade validator
    if "headline" in notice_copy or notice_copy.get("schema_version") == "2.0":
        return validate_v2_notice(
            notice_copy,
            page_texts=page_texts,
            target_schema_path=target_schema_path,
        )

    if (
        schema_path is None
        and "summary_plain" in notice_copy
        and "plain_language_summary" not in notice_copy
    ):
        if LEGACY_SCHEMA_PATH.exists():
            target_schema_path = LEGACY_SCHEMA_PATH

    # Validate against JSON schema; catch OSError and JSONDecodeError specifically
    try:
        with open(target_schema_path, encoding="utf-8") as f:
            schema = json.load(f)
        validator = jsonschema.Draft202012Validator(schema)
        for err in validator.iter_errors(notice_copy):
            errors.append(f"Schema validation error at '{err.json_path}': {err.message}")
    except (json.JSONDecodeError, OSError) as e:
        errors.append(f"Failed to load schema contract from '{target_schema_path}': {e}")

    # Category validation based on active schema contract
    category = notice_copy.get("category")
    if category:
        if target_schema_path == LEGACY_SCHEMA_PATH:
            if category not in LEGACY_CATEGORIES:
                errors.append(
                    f"Invalid category '{category}'. Must be one of {sorted(LEGACY_CATEGORIES)}"
                )
        else:
            if category not in VALID_CATEGORIES:
                errors.append(
                    f"Invalid category '{category}'. Must be one of {sorted(VALID_CATEGORIES)}"
                )

    # Prepare normalized page texts if provided
    normalized_pages: list[str] | None = None
    if page_texts is not None:
        normalized_pages = [normalize_text(p) for p in page_texts]

    def check_item_evidence(parent_obj: Any, field_name: str, is_critical: bool = False) -> None:
        """Inspect evidence grounding, validate page numbers, and enforce status consistency."""
        nonlocal quotes_checked, quotes_verified
        if not isinstance(parent_obj, dict):
            return

        # Extract quote and page from either Phase 1 contract or legacy structure
        if "evidence_quote" in parent_obj or "source_page" in parent_obj:
            quote = parent_obj.get("evidence_quote")
            page = parent_obj.get("source_page")
            has_evidence = True
        elif isinstance(parent_obj.get("evidence"), dict):
            evidence_dict = parent_obj["evidence"]
            quote = evidence_dict.get("quote")
            page = evidence_dict.get("page")
            has_evidence = True
        else:
            quote = None
            page = None
            has_evidence = False

        # Support explicit "not_found" or "uncertain" without flagging as missing evidence error
        if page in ("not_found", "uncertain") or quote in ("not_found", "uncertain"):
            if parent_obj.get("status") == "found":
                parent_obj["status"] = "uncertain"
            return

        # Guard against non-integer page value (rejecting bools since isinstance(True, int) is True)
        valid_page_type = type(page) is int and page >= 1
        current_status = parent_obj.get("status")

        # Flag invalid page types when page is provided
        if has_evidence and page is not None and not valid_page_type:
            if current_status == "found":
                parent_obj["status"] = "uncertain"
            warnings.append(
                f"Grounding warning: Field '{field_name}' has non-integer or invalid page value: {page!r}."
            )
            return

        # For critical fields with status 'found' but missing evidence, set to 'uncertain' and warn
        has_valid_evidence = has_evidence and bool(quote and str(quote).strip()) and valid_page_type
        if is_critical and current_status == "found" and not has_valid_evidence:
            parent_obj["status"] = "uncertain"
            warnings.append(
                f"Grounding warning: Critical field '{field_name}' marked 'found' without valid quote or page evidence."
            )
            return

        # Grounding check against page texts if provided
        if has_valid_evidence and normalized_pages is not None:
            quotes_checked += 1
            page_idx = page - 1
            if 0 <= page_idx < len(normalized_pages):
                page_content = normalized_pages[page_idx]
                norm_quote = normalize_text(str(quote))
                if norm_quote in page_content:
                    quotes_verified += 1
                else:
                    if "status" in parent_obj:
                        parent_obj["status"] = "uncertain"
                    warnings.append(
                        f"Grounding warning: Quote for '{field_name}' not found verbatim on page {page}: '{str(quote)[:50]}...'"
                    )
            else:
                if "status" in parent_obj:
                    parent_obj["status"] = "uncertain"
                total_pages = len(normalized_pages)
                warnings.append(
                    f"Grounding error: Quote for '{field_name}' references page {page}, but notice has only {total_pages} page(s)."
                )

    # Inspect top-level evidence fields
    for field in [
        "notice_title",
        "issuing_organisation",
        "affected_party",
        "main_purpose",
        "title",
        "issuer",
        "summary_plain",
    ]:
        field_data = notice_copy.get(field)
        if isinstance(field_data, dict):
            check_item_evidence(field_data, field, is_critical=False)

    # Inspect plain language summary sections
    plain_summary = notice_copy.get("plain_language_summary")
    if isinstance(plain_summary, dict):
        if "summary" in plain_summary:
            check_item_evidence(plain_summary, "plain_language_summary", is_critical=True)
        for part in [
            "what_is_this",
            "why_it_matters",
            "what_to_do",
            "where_to_do_it",
            "if_deadline_missed",
        ]:
            part_data = plain_summary.get(part)
            if isinstance(part_data, dict):
                check_item_evidence(part_data, f"plain_language_summary.{part}", is_critical=False)

    # Inspect critical fields
    sub_channel = notice_copy.get("submission_channel")
    if isinstance(sub_channel, dict):
        check_item_evidence(sub_channel, "submission_channel", is_critical=True)

    for item in notice_copy.get("deadlines") or []:
        if isinstance(item, dict):
            label = item.get("description") or item.get("label", "unnamed")
            check_item_evidence(item, f"deadline: {label}", is_critical=True)
            # Propagate ambiguous/conflicting deadline status to needs_verification
            if item.get("is_ambiguous_or_conflicting"):
                if "needs_verification" in notice_copy:
                    notice_copy["needs_verification"] = True

    for item in notice_copy.get("required_documents") or []:
        if isinstance(item, dict):
            check_item_evidence(
                item, f"required_document: {item.get('name', 'unnamed')}", is_critical=True
            )

    for item in notice_copy.get("action_steps") or []:
        if isinstance(item, dict):
            check_item_evidence(item, f"action_step: {item.get('order', '?')}", is_critical=True)

    for item in notice_copy.get("penalties") or []:
        if isinstance(item, dict):
            check_item_evidence(
                item, f"penalty: {item.get('description', 'unnamed')}", is_critical=True
            )

    for item in notice_copy.get("fees_penalties") or []:
        if isinstance(item, dict):
            check_item_evidence(
                item, f"fee_penalty: {item.get('description', 'unnamed')}", is_critical=True
            )

    for item in notice_copy.get("warnings") or []:
        if isinstance(item, dict):
            w_label = item.get("warning_text") or item.get("message") or item.get("code", "unnamed")
            check_item_evidence(item, f"warning: {w_label}", is_critical=False)

    # Update needs_verification flag if present on notice and warnings were generated
    if "needs_verification" in notice_copy and notice_copy["needs_verification"] is False:
        if len(warnings) > 0:
            notice_copy["needs_verification"] = True

    grounded_ratio = (quotes_verified / quotes_checked) if quotes_checked > 0 else 1.0

    status = "complete" if len(errors) == 0 else "failed"
    if status == "complete" and len(warnings) > 0:
        status = "partial"

    return {
        "is_valid": len(errors) == 0,
        "schema_compliant": len(errors) == 0,
        "status": status,
        "quotes_checked": quotes_checked,
        "quotes_verified": quotes_verified,
        "grounded_ratio": round(grounded_ratio, 4),
        "unsupported_critical_count": 0,
        "errors": errors,
        "warnings": warnings,
        "notice": notice_copy,
    }
