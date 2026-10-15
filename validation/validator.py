import json
from pathlib import Path
from typing import Any, Dict, List, Optional


def validate_notice(notice: Dict[str, Any], page_texts: Optional[List[str]] = None) -> Dict[str, Any]:
    """Validate extracted notice against schema rules and check evidence grounding.

    Args:
        notice: Extracted notice dictionary to validate.
        page_texts: Optional list of raw string texts extracted per page (0-indexed list for pages 1..N).

    Returns:
        Validation report dict with compliance status, evidence grounding score, errors, and warnings.
    """
    errors: List[str] = []
    warnings: List[str] = []
    quotes_checked = 0
    quotes_verified = 0

    # 1. Essential schema fields check
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

    # 2. Check category
    valid_categories = {"scholarship", "bank", "utility", "tax", "govt_scheme", "unsupported"}
    category = notice.get("category")
    if category and category not in valid_categories:
        errors.append(f"Invalid category '{category}'. Must be one of {sorted(valid_categories)}")

    # 3. Evidence Grounding Check (if page_texts provided)
    if page_texts:
        def check_evidence(evidence: Any, field_name: str) -> None:
            nonlocal quotes_checked, quotes_verified
            if not isinstance(evidence, dict):
                return
            page = evidence.get("page")
            quote = evidence.get("quote")

            if quote and page is not None:
                quotes_checked += 1
                page_idx = page - 1
                if 0 <= page_idx < len(page_texts):
                    page_content = page_texts[page_idx]
                    if quote.lower() in page_content.lower():
                        quotes_verified += 1
                    else:
                        warnings.append(
                            f"Grounding warning: Quote for '{field_name}' not found verbatim on page {page}: '{quote[:50]}...'"
                        )
                else:
                    warnings.append(
                        f"Grounding error: Quote references page {page}, but notice has only {len(page_texts)} pages."
                    )

        # Inspect top-level evidence fields
        for field in ["title", "issuer", "summary_plain", "affected_party", "submission_channel"]:
            field_data = notice.get(field)
            if isinstance(field_data, dict):
                check_evidence(field_data.get("evidence"), field)

        # Inspect array fields
        for item in notice.get("deadlines", []):
            if isinstance(item, dict):
                check_evidence(item.get("evidence"), f"deadline: {item.get('label', 'unnamed')}")

        for item in notice.get("required_documents", []):
            if isinstance(item, dict):
                check_evidence(item.get("evidence"), f"document: {item.get('name', 'unnamed')}")

        for item in notice.get("action_steps", []):
            if isinstance(item, dict):
                check_evidence(item.get("evidence"), f"step: {item.get('order', '?')}")

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
