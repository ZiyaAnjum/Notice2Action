import copy
import json
import re
from pathlib import Path
from typing import Any

import jsonschema

# Canonical schema paths relative to this file's location to avoid CWD dependency
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "notice_output.schema.json"
LEGACY_SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "notice.schema.json"


def normalize_text(text: str) -> str:
    """Normalize whitespace and quotation marks for robust evidence grounding.

    Args:
        text: Raw string containing quotes or page text.

    Returns:
        Lowercased text with straight quotes and collapsed whitespace.
    """
    # Normalize curly quotes to straight quotes
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    # Collapse multiple whitespace characters and line breaks into a single space
    return re.sub(r"\s+", " ", text).strip().lower()


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
    new_categories = {
        "tax_or_revenue",
        "utility_or_billing",
        "legal_or_court",
        "education_or_exam",
        "government_benefit_or_welfare",
        "other_out_of_scope",
    }
    legacy_categories = {
        "scholarship",
        "bank",
        "utility",
        "tax",
        "govt_scheme",
        "unsupported",
    }

    category = notice_copy.get("category")
    if category:
        if target_schema_path == LEGACY_SCHEMA_PATH:
            if category not in legacy_categories:
                errors.append(
                    f"Invalid category '{category}'. Must be one of {sorted(legacy_categories)}"
                )
        else:
            if category not in new_categories:
                errors.append(
                    f"Invalid category '{category}'. Must be one of {sorted(new_categories)}"
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

    # Inspect top-level plain language summary
    plain_summary = notice_copy.get("plain_language_summary")
    if isinstance(plain_summary, dict):
        check_item_evidence(plain_summary, "plain_language_summary", is_critical=True)

    # Inspect legacy top-level evidence fields
    for field in ["title", "issuer", "summary_plain", "affected_party"]:
        field_data = notice_copy.get(field)
        if isinstance(field_data, dict):
            check_item_evidence(field_data, field, is_critical=False)

    # Inspect critical fields
    sub_channel = notice_copy.get("submission_channel")
    if isinstance(sub_channel, dict):
        check_item_evidence(sub_channel, "submission_channel", is_critical=True)

    for item in notice_copy.get("deadlines") or []:
        if isinstance(item, dict):
            label = item.get("description") or item.get("label", "unnamed")
            check_item_evidence(item, f"deadline: {label}", is_critical=True)

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
            check_item_evidence(item, f"warning: {item.get('code', 'unnamed')}", is_critical=False)

    # Update needs_verification flag if present on notice
    if "needs_verification" in notice_copy and notice_copy["needs_verification"] is False:
        if len(warnings) > 0:
            notice_copy["needs_verification"] = True

    grounded_ratio = (quotes_verified / quotes_checked) if quotes_checked > 0 else 1.0

    return {
        "is_valid": len(errors) == 0,
        "schema_compliant": len(errors) == 0,
        "quotes_checked": quotes_checked,
        "quotes_verified": quotes_verified,
        "grounded_ratio": round(grounded_ratio, 4),
        "unsupported_critical_count": 0,
        "errors": errors,
        "warnings": warnings,
        "notice": notice_copy,
    }
