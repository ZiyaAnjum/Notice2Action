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

    Args:
        notice: Extracted notice dictionary to validate.
        page_texts: Optional list of raw string texts extracted per page (0-indexed list for pages 1..N).

    Returns:
        Validation report dict with compliance status, evidence grounding score, errors, and warnings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    quotes_checked = 0
    quotes_verified = 0

    # 1. Validate against JSON schema if present
    if SCHEMA_PATH.exists():
        try:
            with open(SCHEMA_PATH, encoding="utf-8") as f:
                schema = json.load(f)
            validator = jsonschema.Draft202012Validator(schema)
            for err in validator.iter_errors(notice):
                errors.append(f"Schema validation error at '{err.json_path}': {err.message}")
        except Exception as e:
            errors.append(f"Failed to execute schema validation: {e}")
    else:
        # Fallback top-level required fields check
        required_keys = [
            "notice_id",
            "category",
            "category_confidence",
            "title",
            "issuer",
            "summary_plain",
            "affected_party",
            "deadlines",
            "required_documents",
            "action_steps",
            "submission_channel",
            "fees_penalties",
            "warnings",
            "document_quality",
        ]
        for key in required_keys:
            if key not in notice:
                errors.append(f"Missing required top-level field: '{key}'")

    # 2. Category check
    valid_categories = {"scholarship", "bank", "utility", "tax", "govt_scheme", "unsupported"}
    category = notice.get("category")
    if category and category not in valid_categories:
        errors.append(f"Invalid category '{category}'. Must be one of {sorted(valid_categories)}")

    # 3. Evidence Grounding Check (if page_texts provided)
    if page_texts:
        normalized_pages = [normalize_text(p) for p in page_texts]

        def check_evidence(parent_obj: Any, field_name: str) -> None:
            nonlocal quotes_checked, quotes_verified
            if not isinstance(parent_obj, dict):
                return

            evidence = parent_obj.get("evidence")
            if not isinstance(evidence, dict):
                return

            page = evidence.get("page")
            quote = evidence.get("quote")

            if quote and page is not None:
                quotes_checked += 1
                page_idx = page - 1
                if 0 <= page_idx < len(normalized_pages):
                    page_content = normalized_pages[page_idx]
                    norm_quote = normalize_text(quote)
                    if norm_quote in page_content:
                        quotes_verified += 1
                    else:
                        if "status" in parent_obj:
                            parent_obj["status"] = "uncertain"
                        warnings.append(
                            f"Grounding warning: Quote for '{field_name}' not found verbatim on page {page}: '{quote[:50]}...'"
                        )
                else:
                    if "status" in parent_obj:
                        parent_obj["status"] = "uncertain"
                    warnings.append(
                        f"Grounding error: Quote references page {page}, but notice has only {len(page_texts)} pages."
                    )

        # Inspect top-level evidence fields
        for field in ["title", "issuer", "summary_plain", "affected_party", "submission_channel"]:
            field_data = notice.get(field)
            if isinstance(field_data, dict):
                check_evidence(field_data, field)

        # Inspect array fields safely handling None values
        for item in notice.get("deadlines") or []:
            if isinstance(item, dict):
                check_evidence(item, f"deadline: {item.get('label', 'unnamed')}")

        for item in notice.get("required_documents") or []:
            if isinstance(item, dict):
                check_evidence(item, f"document: {item.get('name', 'unnamed')}")

        for item in notice.get("action_steps") or []:
            if isinstance(item, dict):
                check_evidence(item, f"step: {item.get('order', '?')}")

        for item in notice.get("fees_penalties") or []:
            if isinstance(item, dict):
                check_evidence(item, f"fee_penalty: {item.get('description', 'unnamed')}")

        for item in notice.get("warnings") or []:
            if isinstance(item, dict):
                check_evidence(item, f"warning: {item.get('code', 'unnamed')}")

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
    }
