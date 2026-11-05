"""LLM-based structured extraction module for Notice to Action.

Constructs grounded extraction prompts with page markers ([PAGE N]), sends them
to a BaseLLMClient, and validates the output against schemas/notice_output.schema.json
with up to 2 self-repair retry attempts.
"""

import json
import logging
from typing import Any

import jsonschema

from extraction.llm_client import (
    BaseLLMClient,
    LLMError,
    clean_json_markdown,
    get_llm_client,
    sanitize_message,
)
from validation.validator import SCHEMA_PATH

logger = logging.getLogger(__name__)

MAX_EXTRACTION_RETRIES = 2
PROMPT_VERSION = "1.5.0"


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
        "   - A quote must be a single sentence or clause copied character for character. Never use '...' to skip words. "
        "If one quote cannot support the item, use the shortest sentence that does.\n"
        "   - Every evidence_quote must be ONE contiguous passage copied exactly from a single page, with NO ellipsis ('...'), "
        "NO joining of separate sentences, and NO paraphrase.\n"
        "   - For action steps that combine several facts, the evidence_quote must be the single sentence that states the "
        "action itself (for example 'You can pay online through the company app or website, at any authorised collection centre, "
        "or by cheque at the sub-division office.'), not a sentence about the amount or a heading. One contiguous sentence, "
        "character for character.\n"
        "   - Cite the exact 1-indexed source_page where that quote appears (e.g. 1, 2).\n"
        "3. DEADLINES, ROLES, AND CONFLICTS:\n"
        "   - Add a 'role' field to each deadline, one of: 'primary' (the main deadline), 'extended' (a later date that "
        "is allowed with a fee or penalty), 'consequence' (a date or period triggered by something else, for example "
        "'within 7 days of the due date'), 'other'.\n"
        "   - Staged deadlines are NOT conflicts: primary + extended is NOT a conflict. Show both normally with their roles.\n"
        "   - When a notice gives two or more different primary dates for the same kind of obligation (for example the last date "
        "without surcharge vs the bill due date), set is_ambiguous_or_conflicting to true and status to 'conflicting', with "
        "the reason: 'The notice gives two different dates (<date> for <what>, <date> for <what>). Please check which one applies to you.'\n"
        "   - A consequence date stated relative to another date (e.g., 'within 7 days of the due date', "
        "'within 15 days of notice issuance') must appear in the deadlines list with role 'consequence', the original wording as "
        "the date text, status 'uncertain', and is_ambiguous_or_conflicting true with a reason explaining what "
        "reference date is required to calculate it. Do NOT drop it in favour of a warning.\n"
        "4. REQUIRED DOCUMENTS VS. ACTION STEPS:\n"
        "   - required_documents may contain ONLY items the notice explicitly asks the user to provide or submit.\n"
        "   - If the notice names a document as optional or recommended ('optional but recommended'), include it in "
        "required_documents with is_required false and label 'Suggested, not required'.\n"
        "   - Never include conditional items (such as a receipt sent only 'if you have already paid') or alternatives "
        "(such as 'a self-declaration instead') in required_documents.\n"
        "   - Conditional items and alternatives belong in action_steps, NOT in required_documents.\n"
        "5. PENALTIES AND AMOUNTS:\n"
        "   - Extract all stated surcharges, late fees, disconnection warnings, reconnection fees, or legal consequences.\n"
        "   - Keep penalty amounts as written in the notice, including the currency or unit (e.g., 'Rs. 500', '2 percent per month').\n"
        "   - A penalty with no stated amount uses 'not_found' for the amount, NOT null or None.\n"
        "6. ACTION STEPS, ELIGIBILITY, AND ALTERNATIVES:\n"
        "   - ELIGIBILITY CONDITIONS: If the notice states eligibility conditions (for example minimum marks, attendance, "
        "'students with a backlog are not eligible'), add ONE action step at the start (order: 1): "
        "'Check that you meet the conditions in the notice', listing each condition as stated, with a single contiguous "
        "evidence quote for the step (one quote per condition is not needed). Do not invent conditions.\n"
        "   - ALTERNATIVES VS SEQUENCE: When action steps are alternative ways to do one task (for example pay online / "
        "at a collection centre / by cheque, or branch visit vs net banking), return them as ONE step with the options inside "
        "it, or as labelled 'Option 1', 'Option 2', 'Option 3' steps. NEVER return them as consecutive numbered steps that "
        "look like a sequence.\n"
        "   - CONDITIONAL STEP: Keep any conditional step (such as 'If you have already paid, ignore the notice or send the "
        "receipt to the sub-division office') as its own labelled step starting with 'If this applies to you'.\n"
        "   - COMBINED ACTION STEPS: For action steps that combine several facts, the evidence_quote must be the single "
        "sentence that states the action itself (for example 'You can pay online through the company app or website, "
        "at any authorised collection centre, or by cheque at the sub-division office.'), not a sentence about the amount "
        "or a heading. One contiguous sentence, character for character.\n"
        "   - Ordered step-by-step compliance actions must be strictly derived from notice instructions.\n"
        "7. PLAIN LANGUAGE SUMMARY:\n"
        "   - The five summary parts (what_is_this, why_it_matters, what_to_do, where_to_do_it, and if_deadline_missed) "
        "must be plain strings ONLY (not objects with text/evidence_quote/source_page).\n"
        "   - The five summary parts may ONLY restate what the notice explicitly says.\n"
        "   - When the notice states no deadline, the if_deadline_missed summary MUST say 'The notice does not give a deadline.' "
        "Do not reuse penalty text there.\n"
        "   - Do NOT infer cause and effect or add advice not in the notice (for example, do not say that paying before a "
        "date prevents disconnection unless the notice explicitly says so).\n"
        "   - Where the notice is unclear, conflicting, or does not specify details, say so in plain words.\n"
        "8. USER-FACING WARNINGS ONLY:\n"
        "   - The 'warnings' list must contain ONLY explicit cautionary conditions or warnings stated directly in the notice "
        "text for the user (for example 'Cash payments above Rs. 10,000 are not accepted').\n"
        "   - Do not invent warnings, and do not put technical processing notes into warnings.\n"
        "9. STRICT JSON OUTPUT:\n"
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
        error (error message if failed), is_busy (boolean), and raw_response.
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
            safe_err = sanitize_message(err.message)
            is_busy = (
                err.is_retryable
                or err.retries_exhausted
                or (err.status_code in {429, 500, 502, 503, 504})
            )

            # Retry temporary errors if client did not already exhaust retries internally
            if err.is_retryable and not err.retries_exhausted and attempt < max_retries:
                logger.warning(
                    "LLM generation attempt %d failed with retryable error (status=%s): %s. Retrying...",
                    attempt + 1,
                    err.status_code,
                    safe_err,
                )
                continue

            logger.error(
                "LLM generation failed (status=%s, retries_exhausted=%s): %s",
                err.status_code,
                err.retries_exhausted,
                safe_err,
            )
            return {
                "status": "extraction_failed",
                "error": safe_err,
                "is_busy": is_busy,
                "status_code": err.status_code,
                "data": None,
                "raw_response": last_raw_response,
                "attempts": attempt + 1,
            }
        except Exception as err:
            safe_err = sanitize_message(str(err))
            logger.error("Unexpected error during LLM invocation: %s", safe_err)
            return {
                "status": "extraction_failed",
                "error": f"Unexpected error during LLM invocation: {safe_err}",
                "is_busy": False,
                "status_code": None,
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
                "is_busy": False,
                "status_code": None,
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
        "is_busy": False,
        "status_code": None,
        "data": None,
        "raw_response": last_raw_response,
        "attempts": max_retries + 1,
    }
