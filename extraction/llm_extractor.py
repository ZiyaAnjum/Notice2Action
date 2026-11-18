"""LLM-based structured extraction module for Notice to Action.

Constructs grounded extraction prompts with page markers ([PAGE N]), sends them
to a BaseLLMClient, and validates the output against schemas/notice_output.schema.json
with up to 2 self-repair retry attempts.
"""

import json
import logging
import time
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
PROMPT_VERSION = "1.6.1"


COMPACT_EXTRACTION_SCHEMA = {
    "type": "object",
    "required": [
        "notice_type",
        "source_organisation",
        "one_line_summary",
        "summary_plain",
        "deadlines",
        "action_steps",
    ],
    "properties": {
        "notice_type": {"type": "string"},
        "source_organisation": {"type": "string"},
        "one_line_summary": {"type": "string"},
        "summary_plain": {"type": "string"},
        "amount_due": {"type": ["string", "null"]},
        "deadlines": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["label", "date_raw", "page", "quote"],
                "properties": {
                    "label": {"type": "string"},
                    "date_raw": {"type": "string"},
                    "kind": {"type": "string"},
                    "is_relative": {"type": "boolean"},
                    "offset_days": {"type": ["integer", "null"]},
                    "relative_to": {"type": ["string", "null"]},
                    "page": {"type": "integer"},
                    "quote": {"type": "string"},
                },
            },
        },
        "action_steps": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["order", "text", "page", "quote"],
                "properties": {
                    "order": {"type": "integer"},
                    "text": {"type": "string"},
                    "page": {"type": "integer"},
                    "quote": {"type": "string"},
                },
            },
        },
        "consequences": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["label", "value", "page", "quote"],
                "properties": {
                    "label": {"type": "string"},
                    "value": {"type": "string"},
                    "page": {"type": "integer"},
                    "quote": {"type": "string"},
                },
            },
        },
        "required_documents": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "page", "quote"],
                "properties": {
                    "name": {"type": "string"},
                    "page": {"type": "integer"},
                    "quote": {"type": "string"},
                },
            },
        },
        "where_to_submit": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["channel", "page", "quote"],
                "properties": {
                    "channel": {"type": "string"},
                    "details": {"type": "string"},
                    "page": {"type": "integer"},
                    "quote": {"type": "string"},
                },
            },
        },
        "conditions_that_apply": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["condition", "page", "quote"],
                "properties": {
                    "condition": {"type": "string"},
                    "page": {"type": "integer"},
                    "quote": {"type": "string"},
                },
            },
        },
    },
}


def load_notice_schema() -> dict[str, Any]:
    """Load the canonical notice JSON schema."""
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def build_system_prompt() -> str:
    """Build concise, grounded system prompt instructing zero-hallucination and evidence grounding."""
    return (
        "You are an expert official notice parser. Extract structured, evidence-backed information "
        "from official notices into JSON adhering strictly to the provided response schema.\n\n"
        "STRICT EXTRACTION RULES:\n"
        "1. ZERO HALLUCINATION / NULL ON ABSENCE: Extract ONLY facts stated explicitly in the text. "
        "Never invent dates, amounts, or steps. For optional documents, label them 'Suggested, not required'.\n"
        "2. VERBATIM EVIDENCE GROUNDING: For all extracted items, copy the exact quote verbatim from the text. "
        "Every quote must be ONE contiguous passage copied character-for-character from a single page with NO ellipsis ('...'), "
        "NO joining of separate sentences, and NO paraphrase. Cite the exact 1-indexed page number. "
        "For action steps that combine several facts, the evidence_quote must be the single sentence that states the action itself.\n"
        "3. DEADLINES & RELATIVE DATES: Extract date as written in 'date_raw'. If relative ('within 7 days of due date'), "
        "set is_relative=true, offset_days=7, relative_to='due_date'. Assign kind: 'no_penalty_by' | 'due' | 'disconnection_risk' | 'other' | 'relative'.\n"
        "4. MONEY & AMOUNTS: Extract the stated amount in amount_due (e.g. 'Rs. 4,860.00').\n"
        "5. ACTION STEPS, ELIGIBILITY, AND ALTERNATIVES: Extract concrete actions. Never leave text empty. "
        "If the notice states eligibility conditions, add ONE action step at the start: 'Check that you meet the conditions in the notice'. "
        "When action steps are alternative ways to do one task, label them 'Option 1', 'Option 2', 'Option 3'. "
        "Keep any conditional step as its own labelled step starting with 'If this applies to you'.\n"
        "6. PLAIN LANGUAGE SUMMARY: Write a concise one-line summary and a plain summary. "
        "if_deadline_missed must only state a consequence the notice explicitly ties to missing a deadline. "
        "Otherwise write 'The notice does not state what happens if you miss the deadline.'\n"
        "7. USER-FACING WARNINGS ONLY: The 'warnings' list must contain ONLY explicit cautionary conditions or warnings "
        "stated directly in the notice text for the user (for example 'Cash payments above Rs. 10,000 are not accepted').\n"
        "8. MULTILINGUAL AND NON-ENGLISH NOTICES: If the notice is written in a language other than English, "
        "write summaries and steps in English, but keep all evidence quotes in original verbatim script.\n"
        "9. STRICT JSON OUTPUT: Return ONLY valid JSON adhering strictly to the schema."
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
    schema: dict[str, Any] | None = None,
) -> str:
    """Assemble user prompt containing notice text, category hint, and target schema."""
    doc_text = build_document_content_block(pages)
    schema_note = ""
    if schema is not None:
        schema_note = f"\nTARGET JSON SCHEMA:\n{json.dumps(schema, indent=2)}\n"

    return (
        f"PREDICTED CATEGORY: {category}\n\n"
        "=== NOTICE DOCUMENT TEXT ===\n"
        f"{doc_text}\n"
        "=== END OF DOCUMENT TEXT ===\n"
        f"{schema_note}\n"
        "Extract the complete structured notice from the text above conforming to the schema. "
        "Ensure all evidence quotes are verbatim character-for-character copies and source pages "
        "match the [PAGE N] markers. Return only valid JSON."
    )


def validate_extracted_data(
    data: Any,
    schema: dict[str, Any],
) -> list[str]:
    """Validate data structure against schema, returning error list."""
    if not isinstance(data, dict):
        return ["Extracted output is not a JSON object (expected dict)."]

    # If data is in compact or v2 form, validate basic requirements
    if "one_line_summary" in data or "headline" in data:
        errs = []
        if not data.get("deadlines") and not data.get("action_steps") and not data.get("one_line_summary"):
            errs.append("Missing required fields: deadlines, action_steps, or summary.")
        return errs

    # Otherwise validate against schema
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
    max_retries: int = 1,
) -> dict[str, Any]:
    """Extract structured notice JSON using an LLM with single targeted repair call on error.

    Rules:
    - Uses Gemini structured output (response_schema=COMPACT_EXTRACTION_SCHEMA).
    - Retry at most 2 times internally on network/timeout/5xx.
    - Never retry on a validation error with the same prompt; instead send ONE targeted
      'repair' call that includes the validation error message.
    """
    llm = client or get_llm_client()
    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(pages, category)
    target_response_schema = COMPACT_EXTRACTION_SCHEMA

    last_raw_response: str = ""
    last_errors: list[str] = []
    current_user_prompt = user_prompt

    # Attempt 0: Initial call; Attempt 1: Targeted repair call (if needed)
    for attempt in range(max_retries + 1):
        if hasattr(llm, "get_remaining_budget") and llm.get_remaining_budget() <= 0.0:
            logger.warning("Pipeline total budget exhausted before extraction attempt %d.", attempt + 1)
            return {
                "status": "extraction_failed",
                "failure_reason": "too_slow",
                "error": "Pipeline total budget exhausted.",
                "is_busy": False,
                "is_timeout": True,
                "status_code": None,
                "data": None,
                "raw_response": last_raw_response,
                "attempts": attempt + 1,
            }

        t0_call = time.perf_counter()
        in_size = len(system_prompt) + len(current_user_prompt)
        try:
            raw_response = llm.generate_json(
                system_prompt,
                current_user_prompt,
                response_schema=target_response_schema,
            )
            last_raw_response = raw_response
            call_dur = time.perf_counter() - t0_call
            logger.info(
                "[TIMING] stage=llm_call duration=%.4fs input_size=%d chars output_size=%d chars (attempt=%d, status=success)",
                call_dur,
                in_size,
                len(raw_response),
                attempt + 1,
            )
        except LLMError as err:
            call_dur = time.perf_counter() - t0_call
            safe_err = sanitize_message(err.message)
            logger.info(
                "[TIMING] stage=llm_call duration=%.4fs input_size=%d chars output_size=0 chars (attempt=%d, status=error, code=%s, err=%s)",
                call_dur,
                in_size,
                attempt + 1,
                err.status_code,
                safe_err,
            )
            is_busy = (
                err.is_retryable
                or err.retries_exhausted
                or (err.status_code in {429, 500, 502, 503, 504})
            )
            is_budget_exhausted = (
                (hasattr(llm, "get_remaining_budget") and llm.get_remaining_budget() <= 0.0)
                or (err.is_timeout and err.retries_exhausted)
                or "budget exhausted" in safe_err.lower()
            )
            if is_budget_exhausted:
                return {
                    "status": "extraction_failed",
                    "failure_reason": "too_slow",
                    "error": safe_err,
                    "is_busy": is_busy,
                    "is_timeout": True,
                    "status_code": err.status_code,
                    "data": None,
                    "raw_response": last_raw_response,
                    "attempts": attempt + 1,
                }

            # Retry retryable error if attempts remain (e.g. from FakeLLMClient)
            if err.is_retryable and not err.retries_exhausted and attempt < max_retries:
                logger.warning(
                    "LLM generation attempt %d failed with retryable error (status=%s): %s. Retrying...",
                    attempt + 1,
                    err.status_code,
                    safe_err,
                )
                continue

            return {
                "status": "extraction_failed",
                "error": safe_err,
                "is_busy": is_busy,
                "is_timeout": err.is_timeout,
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
                # Send ONE targeted repair call with the error message
                current_user_prompt = (
                    f"{user_prompt}\n\n"
                    "PREVIOUS ATTEMPT FAILED WITH JSON SYNTAX ERROR:\n"
                    f"{dec_err}\n"
                    "Please repair the syntax and output strictly valid JSON conforming to the schema."
                )
                continue
            else:
                break

        # 2. Check extracted structure
        schema = load_notice_schema()
        validation_errors = validate_extracted_data(parsed_data, schema)
        if not validation_errors:
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
        if attempt < max_retries:
            # Send ONE targeted repair call that includes the validation error message
            err_summary = "\n".join(f"- {e}" for e in validation_errors[:5])
            current_user_prompt = (
                f"{user_prompt}\n\n"
                "PREVIOUS ATTEMPT FAILED VALIDATION WITH ERRORS:\n"
                f"{err_summary}\n\n"
                "Please repair the JSON output to resolve these errors. Output strictly valid JSON."
            )

    return {
        "status": "extraction_failed",
        "error": f"Schema validation failed after repair attempt: {'; '.join(last_errors[:3])}",
        "is_busy": False,
        "status_code": None,
        "data": None,
        "raw_response": last_raw_response,
        "attempts": max_retries + 1,
    }
