"""LLM-based document triage module for Notice to Action.

Classifies incoming documents using the first 2 pages into canonical categories:
- Tested categories: scholarship_or_college, bank, utility, tax_or_payment, government_scheme
- General mode categories: insurance_or_health, legal_or_court, employment, other_official_notice
- Refusal category: not_a_notice (or is_actionable_notice=False)

Skipping Rule:
If the fast rule-based classifier identifies a tested category with confidence >= 0.85,
LLM triage is skipped.
"""

import json
import logging
from typing import Any

from extraction.llm_client import (
    BaseLLMClient,
    LLMError,
    clean_json_markdown,
    get_llm_client,
    sanitize_message,
)
from validation.validator import GENERAL_MODE_CATEGORIES, TESTED_CATEGORIES

logger = logging.getLogger(__name__)

# Confidence threshold to skip LLM triage when rule-based classifier is already confident
RULE_BASED_CONFIDENCE_THRESHOLD = 0.85

TRIAGE_CATEGORIES = (
    *TESTED_CATEGORIES,
    *GENERAL_MODE_CATEGORIES,
    "not_a_notice",
)


def build_triage_system_prompt() -> str:
    """Build compact triage system prompt instructing classification into categories."""
    return (
        "You are an expert document triage classifier for official and administrative notices.\n"
        "Your task is to analyze the first 1-2 pages of a document and determine if it is an actionable official notice, "
        "what category it belongs to, your confidence, and a brief plain-language reason.\n\n"
        "CATEGORIES:\n"
        "- scholarship_or_college: Academic scholarships, tuition/hostel fee demands, university circulars, exam notices.\n"
        "- bank: Banking notifications, account dormancy/freezing, KYC/re-KYC demands, EMI/loan overdue notices.\n"
        "- utility: Electricity, water, gas, telecom bills, disconnection notices, meter replacement.\n"
        "- tax_or_payment: Municipal property tax demands, statutory tax notices, revenue demand notices.\n"
        "- government_scheme: Government welfare schemes, subsidy enrollments, beneficiary verification circulars.\n"
        "- insurance_or_health: Health insurance policy alerts, premium dues, claim submission notices, hospital or medical board directives.\n"
        "- legal_or_court: Court summons, legal notices from advocates, hearing dates, statutory compliance notices.\n"
        "- employment: Official employer or civil service notices, appointment/deputation circulars, disciplinary or wage notices.\n"
        "- other_official_notice: Any other actionable official notice issued by a recognized governmental, municipal, or regulated institution.\n"
        "- not_a_notice: Cooking recipes, marketing flyers, personal letters, receipts, blog articles, textbooks, stories, essays, or non-actionable documents.\n\n"
        "DECISION RULES:\n"
        "1. If the document is not an official notice (e.g. a recipe, advertisement, novel, study notes, or unrelated non-notice), "
        "set is_actionable_notice to false, category to 'not_a_notice', and give a clear explanation in reason.\n"
        "2. If it is an actionable official notice, set is_actionable_notice to true, choose the single best matching category "
        "from the list above, provide confidence (0.0 to 1.0), and a concise plain-language reason.\n"
        "3. Return ONLY a valid JSON object strictly matching this format:\n"
        "{\n"
        '  "is_actionable_notice": boolean,\n'
        '  "category": string,\n'
        '  "confidence": number,\n'
        '  "reason": string\n'
        "}\n"
    )


def build_triage_user_prompt(pages: list[dict[str, Any]]) -> str:
    """Format the text of the first two pages for lightweight triage classification."""
    lines = ["Here are the first pages of the uploaded document:\n"]
    for page in pages[:2]:
        p_num = page.get("page_number", 1)
        p_text = (page.get("text") or "").strip()
        lines.append(f"--- [PAGE {p_num}] ---")
        lines.append(p_text[:2000])
        lines.append("")
    lines.append(
        "Classify this document according to the triage rules and return ONLY the JSON object."
    )
    return "\n".join(lines)


def triage_notice(
    pages: list[dict[str, Any]],
    client: BaseLLMClient | None = None,
) -> dict[str, Any]:
    """Execute LLM triage classification call on the first two pages.

    Args:
        pages: Extracted page dictionaries.
        client: Optional BaseLLMClient for dependency injection.

    Returns:
        Structured triage dictionary:
        {status, is_actionable_notice, category, confidence, reason, error}
    """
    llm = client or get_llm_client()
    system_prompt = build_triage_system_prompt()
    user_prompt = build_triage_user_prompt(pages)

    try:
        raw_response = llm.generate_json(system_prompt, user_prompt)
    except LLMError as err:
        safe_err = sanitize_message(err.message)
        logger.warning(
            "LLM triage call failed with LLMError (status=%s): %s", err.status_code, safe_err
        )
        return {
            "status": "failed",
            "error": safe_err,
            "is_actionable_notice": None,
            "category": None,
            "confidence": 0.0,
            "reason": None,
        }
    except Exception as err:
        safe_err = sanitize_message(str(err))
        logger.warning("Unexpected error during LLM triage call: %s", safe_err)
        return {
            "status": "failed",
            "error": safe_err,
            "is_actionable_notice": None,
            "category": None,
            "confidence": 0.0,
            "reason": None,
        }

    try:
        cleaned = clean_json_markdown(raw_response)
        data = json.loads(cleaned)
    except Exception as err:
        logger.warning("Failed to decode JSON from triage response: %s", err)
        return {
            "status": "failed",
            "error": f"Invalid JSON returned by triage model: {err}",
            "is_actionable_notice": None,
            "category": None,
            "confidence": 0.0,
            "reason": None,
        }

    if not isinstance(data, dict):
        return {
            "status": "failed",
            "error": "Triage output is not a JSON object",
            "is_actionable_notice": None,
            "category": None,
            "confidence": 0.0,
            "reason": None,
        }

    category = data.get("category")
    if category == "other_out_of_scope":
        category = "not_a_notice"

    if category not in TRIAGE_CATEGORIES:
        logger.warning("Triage returned unrecognized category: %s", category)
        return {
            "status": "failed",
            "error": f"Unrecognized category '{category}' from triage model",
            "is_actionable_notice": None,
            "category": None,
            "confidence": 0.0,
            "reason": None,
        }

    is_actionable = bool(data.get("is_actionable_notice", False))
    confidence = float(data.get("confidence", 0.0) or 0.0)
    reason = str(data.get("reason", "") or "").strip()

    return {
        "status": "success",
        "error": None,
        "is_actionable_notice": is_actionable,
        "category": category,
        "confidence": confidence,
        "reason": reason,
    }
