import copy
import json
import re
from pathlib import Path
from typing import Any

import jsonschema

# Resolve schema path relative to this file's location to avoid CWD dependency on Windows
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "notice.schema.json"


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


def validate_notice(notice: dict, page_texts: list[str] | None = None) -> dict:
    """Validate extracted notice against schema rules and check evidence grounding.

    Deep-copies the input notice at the start and returns a modified copy containing
    grounding status adjustments without mutating the caller's dictionary.

    Args:
        notice: Extracted notice dictionary to validate.
        page_texts: Optional list of raw string texts extracted per page (0-indexed list for pages 1..N).

    Returns:
        Validation report dict with compliance status, evidence grounding score, errors,
        warnings, and the validated notice deep copy under 'notice'.
    """
    # 3. Deep-copy input notice to never mutate caller's dict
    notice_copy: dict[str, Any] = copy.deepcopy(notice)

    errors: list[str] = []
    warnings: list[str] = []
    quotes_checked = 0
    quotes_verified = 0

    # 1. & 2. & 4. Validate against JSON schema; catch OSError and JSONDecodeError specifically
    try:
        with open(SCHEMA_PATH, encoding="utf-8") as f:
            schema = json.load(f)
        validator = jsonschema.Draft202012Validator(schema)
        for err in validator.iter_errors(notice_copy):
            errors.append(f"Schema validation error at '{err.json_path}': {err.message}")
    except (json.JSONDecodeError, OSError) as e:
        # If schema cannot be loaded, record error and do not fall back to weaker key check
        errors.append(f"Failed to load schema contract from '{SCHEMA_PATH}': {e}")

    # Category validation
    valid_categories = {"scholarship", "bank", "utility", "tax", "govt_scheme", "unsupported"}
    category = notice_copy.get("category")
    if category and category not in valid_categories:
        errors.append(f"Invalid category '{category}'. Must be one of {sorted(valid_categories)}")

    # Prepare normalized page texts if provided
    normalized_pages: list[str] | None = None
    if page_texts is not None:
        normalized_pages = [normalize_text(p) for p in page_texts]

    def check_item_evidence(parent_obj: Any, field_name: str, is_critical: bool = False) -> None:
        """Inspect evidence grounding, validate page numbers, and enforce status consistency."""
        nonlocal quotes_checked, quotes_verified
        if not isinstance(parent_obj, dict):
            return

        evidence = parent_obj.get("evidence")
        has_evidence_dict = isinstance(evidence, dict)

        page = evidence.get("page") if has_evidence_dict else None
        quote = evidence.get("quote") if has_evidence_dict else None

        # 7. Guard against non-integer page value (rejecting bools since isinstance(True, int) is True)
        valid_page_type = type(page) is int and page >= 1

        current_status = parent_obj.get("status")

        # Flag invalid page types when page is provided
        if has_evidence_dict and page is not None and not valid_page_type:
            if current_status == "found":
                parent_obj["status"] = "uncertain"
            warnings.append(
                f"Grounding warning: Field '{field_name}' has non-integer or invalid page value: {page!r}."
            )
            return

        # 5. For critical fields with status 'found' but missing evidence, set to 'uncertain' and warn
        has_valid_evidence = (
            has_evidence_dict and bool(quote and str(quote).strip()) and valid_page_type
        )
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
    for field in ["title", "issuer", "summary_plain", "affected_party"]:
        field_data = notice_copy.get(field)
        if isinstance(field_data, dict):
            check_item_evidence(field_data, field, is_critical=False)

    # 5. & 6. Inspect critical fields using actual schema field names
    sub_channel = notice_copy.get("submission_channel")
    if isinstance(sub_channel, dict):
        check_item_evidence(sub_channel, "submission_channel", is_critical=True)

    for item in notice_copy.get("deadlines") or []:
        if isinstance(item, dict):
            check_item_evidence(item, f"deadline: {item.get('label', 'unnamed')}", is_critical=True)

    for item in notice_copy.get("required_documents") or []:
        if isinstance(item, dict):
            check_item_evidence(
                item, f"required_document: {item.get('name', 'unnamed')}", is_critical=True
            )

    for item in notice_copy.get("action_steps") or []:
        if isinstance(item, dict):
            check_item_evidence(item, f"action_step: {item.get('order', '?')}", is_critical=True)

    for item in notice_copy.get("fees_penalties") or []:
        if isinstance(item, dict):
            check_item_evidence(
                item, f"fee_penalty: {item.get('description', 'unnamed')}", is_critical=True
            )

    # 6. Warnings array: actual schema fields are 'code', 'message', 'severity', 'evidence'
    for item in notice_copy.get("warnings") or []:
        if isinstance(item, dict):
            check_item_evidence(item, f"warning: {item.get('code', 'unnamed')}", is_critical=False)

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
