"""LLM-based structured extraction module for Notice to Action.

Constructs grounded extraction prompts with page markers ([PAGE N]), sends them
to a BaseLLMClient, and validates the output against schemas/notice_output.schema.json
with up to 2 self-repair retry attempts.
"""

import json
from typing import Any

import jsonschema

from extraction.llm_client import BaseLLMClient, LLMError, clean_json_markdown, get_llm_client
from validation.validator import SCHEMA_PATH

MAX_EXTRACTION_RETRIES = 2
PROMPT_VERSION = "1.0.0"


def load_notice_schema() -> dict[str, Any]:
    """Load the canonical notice JSON schema."""
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def build_system_prompt() -> str:
    """Build the system prompt instructing zero-hallucination and evidence grounding."""
    return (
        "You are an expert official notice parser. Your mission is to extract structured, "
        "evidence-backed information from official notices (such as scholarships, bank notices, "
        "utility disconnection warnings, tax demands, and government welfare circulars) into "
        "valid JSON conforming strictly to the provided JSON Schema.\n\n"
        "STRICT EXTRACTION RULES:\n"
        "1. ZERO HALLUCINATION / NULL ON ABSENCE:\n"
        "   - Use ONLY information explicitly stated in the notice text.\n"
        "   - NEVER invent, infer, or extrapolate deadlines, document requirements, fees, penalties, "
        "contact offices, or action steps.\n"
        "   - If information is not present, use 'not_found' or null and set status to 'not_found'.\n"
        "   - If information is unclear, conflicting, or partial, set status to 'uncertain'.\n"
        "2. VERBATIM EVIDENCE GROUNDING:\n"
        "   - For all critical fields (notice_title, issuing_organisation, affected_party, main_purpose, "
        "deadlines, required_documents, submission_channel, penalties, action_steps), copy the exact "
        "evidence_quote verbatim from the text.\n"
        "   - Cite the exact 1-indexed source_page where that quote appears (e.g. 1, 2).\n"
        "3. RELATIVE AND CONFLICTING DEADLINES:\n"
        "   - If a deadline date is relative (e.g., 'within 15 days of receipt') without a specific "
        "calendar date, record 'uncertain' as the date, set is_ambiguous_or_conflicting to true, "
        "and explain the ambiguity in ambiguity_reason.\n"
        "4. REQUIRED VS. OPTIONAL DOCUMENTS:\n"
        "   - Set is_required to true ONLY when the notice explicitly mandates submission.\n"
        "   - If a document is merely recommended or optional, set is_required to false.\n"
        "5. ACTION STEPS:\n"
        "   - Extract ordered step-by-step compliance actions strictly from textual instructions.\n"
        "6. PLAIN LANGUAGE SUMMARY:\n"
        "   - Provide clear, simple explanations as plain strings for: what_is_this, why_it_matters, "
        "what_to_do, where_to_do_it, and if_deadline_missed.\n"
        "7. STRICT JSON OUTPUT:\n"
        "   - Return ONLY raw JSON strictly conforming to schemas/notice_output.schema.json.\n"
        "   - Do not include explanations, code block fences, or text outside the JSON object."
    )


def build_document_content_block(pages: list[dict[str, Any]]) -> str:
    """Format pages with clear page markers [PAGE N] for source attribution."""
    blocks: list[str] = []
    for page in pages:
        p_num = page.get("page_number", 1)
        text = page.get("text", "").strip()
        blocks.append(f"[PAGE {p_num}]\n{text}")
    return "\n\n".join(blocks)


def build_user_prompt(
    pages: list[dict[str, Any]],
    category: str,
    schema: dict[str, Any],
) -> str:
    """Assemble user prompt containing notice text, category hint, and target schema."""
    doc_text = build_document_content_block(pages)
    schema_str = json.dumps(schema, indent=2)

    return (
        f"PREDICTED CATEGORY: {category}\n\n"
        "=== NOTICE DOCUMENT TEXT ===\n"
        f"{doc_text}\n"
        "=== END OF DOCUMENT TEXT ===\n\n"
        "TARGET JSON SCHEMA:\n"
        f"{schema_str}\n\n"
        "Extract the complete structured notice from the text above conforming to the schema. "
        "Ensure all evidence quotes are verbatim character-for-character copies and source pages "
        "match the [PAGE N] markers. Return only valid JSON."
    )


def validate_extracted_data(
    data: Any,
    schema: dict[str, Any],
) -> list[str]:
    """Validate data structure against Draft 2020-12 schema, returning error list."""
    if not isinstance(data, dict):
        return ["Extracted output is not a JSON object (expected dict)."]

    validator_cls = jsonschema.validators.validator_for(schema)
    validator = validator_cls(schema)
    errors: list[str] = []

    for err in sorted(validator.iter_errors(data), key=lambda e: e.path):
        field_path = ".".join(str(p) for p in err.path) or "root"
        errors.append(f"Field '{field_path}': {err.message}")

    return errors


def extract_notice_with_llm(
    pages: list[dict[str, Any]],
    category: str,
    client: BaseLLMClient | None = None,
    max_retries: int = MAX_EXTRACTION_RETRIES,
) -> dict[str, Any]:
    """Extract structured notice JSON using an LLM with self-repair retry loop.

    Args:
        pages: List of extracted page dictionaries with 'page_number' and 'text'.
        category: Verified notice category string.
        client: Optional BaseLLMClient instance. Defaults to get_llm_client().
        max_retries: Maximum number of repair attempts on schema validation error.

    Returns:
        Dict with status ('success' | 'extraction_failed'), data (extracted notice or None),
        error (error message if failed), and raw_response.
    """
    llm = client or get_llm_client()
    schema = load_notice_schema()
    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(pages, category, schema)

    last_raw_response: str = ""
    last_errors: list[str] = []

    current_user_prompt = user_prompt

    for attempt in range(max_retries + 1):
        try:
            raw_response = llm.generate_json(system_prompt, current_user_prompt)
            last_raw_response = raw_response
        except LLMError as err:
            return {
                "status": "extraction_failed",
                "error": f"LLM generation failed: {err.message}",
                "data": None,
                "raw_response": last_raw_response,
                "attempts": attempt + 1,
            }
        except Exception as err:
            return {
                "status": "extraction_failed",
                "error": f"Unexpected error during LLM invocation: {err}",
                "data": None,
                "raw_response": last_raw_response,
                "attempts": attempt + 1,
            }

        # 1. Parse JSON
        try:
            cleaned = clean_json_markdown(raw_response)
            parsed_data = json.loads(cleaned)
        except json.JSONDecodeError as dec_err:
            last_errors = [f"JSON syntax error: {dec_err}"]
            if attempt < max_retries:
                current_user_prompt = (
                    f"{user_prompt}\n\n"
                    "PREVIOUS ATTEMPT FAILED WITH JSON SYNTAX ERROR:\n"
                    f"{dec_err}\n"
                    "Please repair the syntax and output strictly valid JSON conforming to the schema."
                )
                continue
            else:
                break

        # 2. Validate against JSON Schema
        validation_errors = validate_extracted_data(parsed_data, schema)
        if not validation_errors:
            # Valid extraction achieved!
            return {
                "status": "success",
                "data": parsed_data,
                "error": None,
                "raw_response": raw_response,
                "attempts": attempt + 1,
            }

        last_errors = validation_errors

        # If errors and retries remaining, prepare self-repair prompt
        if attempt < max_retries:
            err_summary = "\n".join(f"- {e}" for e in validation_errors[:5])
            current_user_prompt = (
                f"{user_prompt}\n\n"
                "PREVIOUS ATTEMPT FAILED SCHEMA VALIDATION WITH THE FOLLOWING ERRORS:\n"
                f"{err_summary}\n\n"
                "Please repair the JSON output to satisfy all schema requirements exactly. "
                "Output ONLY the corrected valid JSON."
            )

    # All retries exhausted: return structured failure without raising an unhandled exception
    return {
        "status": "extraction_failed",
        "error": f"Schema validation failed after {max_retries} repair retries: {'; '.join(last_errors[:3])}",
        "data": None,
        "raw_response": last_raw_response,
        "attempts": max_retries + 1,
    }
