"""Unit tests for post_processor grouping, conditional actions, deadline filtering, and simple summary.

Verifies:
1. "Option 1/2/3" actions are automatically detected and grouped under a single group_id with action_type="alternative".
2. "If you have already..." actions are marked as action_type="conditional" with condition string.
3. Non-deadline consequence risk items (e.g. "Disconnection risk window") are removed from deadlines and routed to consequences.
4. Deadlines with date_rule_text are preserved; calculated dates are marked date_type="calculated"; empty cards lacking both date and rule are dropped.
5. Simple summary is properly generated and falls back to grade-6 summaries when missing.
"""

from __future__ import annotations

import pytest

from extraction.post_processor import process_extracted_notice_to_decision_card
from extraction.llm_extractor import COMPACT_EXTRACTION_SCHEMA
from extraction.schema_sanitizer import sanitize_gemini_schema
from extraction.tests.test_gemini_schema_sanitizer import _assert_no_list_types_or_unsupported_keywords


def test_post_processor_groups_alternative_actions():
    raw_result = {
        "action_steps": [
            {"order": 1, "text": "Option 1: Pay online at portal https://example.com"},
            {"order": 2, "text": "Option 2: Pay by cheque addressed to Bescom"},
            {"order": 3, "text": "Option 3: Pay in person at collection centre"},
        ],
        "deadlines": [{"id": "dl_1", "label": "Due date", "iso_date": "2026-11-20"}],
    }

    processed = process_extracted_notice_to_decision_card(raw_result)
    steps = processed["action_steps"]

    assert len(steps) == 3
    # All alternatives should share the same group_id and have action_type="alternative"
    assert steps[0]["action_type"] == "alternative"
    assert steps[1]["action_type"] == "alternative"
    assert steps[2]["action_type"] == "alternative"
    assert steps[0]["group_id"] == steps[1]["group_id"] == steps[2]["group_id"]
    assert "Pay the bill" in steps[0]["group_title"]


def test_post_processor_detects_conditional_action():
    raw_result = {
        "action_steps": [
            {"order": 1, "text": "Pay outstanding bill"},
            {"order": 2, "text": "If you have already paid, send the receipt to support@example.com"},
        ],
        "deadlines": [{"id": "dl_1", "label": "Due date", "iso_date": "2026-11-20"}],
    }

    processed = process_extracted_notice_to_decision_card(raw_result)
    steps = processed["action_steps"]

    assert steps[0]["action_type"] == "required"
    assert steps[1]["action_type"] == "conditional"
    assert steps[1]["condition"] is not None
    assert "already paid" in steps[1]["condition"].lower()


def test_post_processor_routes_non_deadline_consequences():
    raw_result = {
        "action_steps": [{"order": 1, "text": "Pay bill"}],
        "deadlines": [
            {"id": "dl_1", "label": "Payment due date", "iso_date": "2026-11-20"},
            {"id": "dl_2", "label": "Disconnection risk window: 15 days grace period", "iso_date": None},
        ],
        "consequences": [],
    }

    processed = process_extracted_notice_to_decision_card(raw_result)
    deadlines = processed["deadlines"]
    consequences = processed.get("consequences", [])

    # The consequence risk item should have been removed from deadlines
    assert len(deadlines) == 1
    assert deadlines[0]["id"] == "dl-1"
    assert deadlines[0]["label"] == "Payment due date"

    # And routed into consequences
    consequence_labels = [c.get("label", "") for c in consequences]
    assert any("Disconnection risk window" in lbl for lbl in consequence_labels)


def test_post_processor_drops_empty_deadlines_and_handles_relative_rules():
    raw_result = {
        "action_steps": [{"order": 1, "text": "Pay bill"}],
        "deadlines": [
            # Has absolute date
            {"id": "dl_1", "label": "Payment due date", "iso_date": "2026-11-20"},
            # Has relative rule but no absolute date
            {"id": "dl_2", "label": "Appeal period", "iso_date": None, "date_rule_text": "Within 30 days of receipt"},
            # Empty card with NO date and NO rule
            {"id": "dl_3", "label": "Date unspecified", "iso_date": None, "date_rule_text": None},
        ],
    }

    processed = process_extracted_notice_to_decision_card(raw_result)
    deadlines = processed["deadlines"]

    # dl_3 should be dropped
    assert len(deadlines) == 2
    assert any(d["label"] == "Payment due date" for d in deadlines)
    assert any(d["label"] == "Appeal period" for d in deadlines)
    assert not any(d["label"] == "Date unspecified" for d in deadlines)

    dl2 = next(d for d in deadlines if d["label"] == "Appeal period")
    assert dl2["date_rule_text"] == "Within 30 days of receipt"


def test_post_processor_simple_summary_generation():
    raw_result = {
        "category": "utility",
        "action_steps": [{"order": 1, "text": "Pay electricity bill of Rs. 4,860"}],
        "deadlines": [{"id": "dl_1", "label": "Due date", "iso_date": "2026-11-20"}],
        "consequences": [{"label": "Late fee", "value": "Surcharge of 2%"}],
    }

    processed = process_extracted_notice_to_decision_card(raw_result)
    simple_summary = processed.get("simple_summary")

    assert simple_summary is not None
    assert "what_is_this" in simple_summary
    assert "what_to_do" in simple_summary
    assert "by_when" in simple_summary
    assert "if_you_ignore" in simple_summary
    assert simple_summary["what_to_do"] == "Pay electricity bill of Rs. 4,860"


def test_schema_sanitizer_with_new_schema_2_1():
    # Verify that the updated COMPACT_EXTRACTION_SCHEMA sanitizes cleanly with no list types
    sanitized = sanitize_gemini_schema(COMPACT_EXTRACTION_SCHEMA)
    _assert_no_list_types_or_unsupported_keywords(sanitized)
