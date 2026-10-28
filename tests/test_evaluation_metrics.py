"""Unit tests for evaluation metrics (Phase 6 Part B).

Tests:
1. compute_string_similarity (identical, substring, disjoint).
2. normalize_deadline_date (ISO date, datetime, not_found, None).
3. match_deadlines (exact date, fuzzy wording, invented deadline detection, missed deadline).
4. match_fuzzy_items (doc/step matching, thresholds, TP/FP/FN counts).
5. check_grounding_and_unsupported (grounded item, uncertain item, unsupported critical offender).
6. evaluate_single_notice (refusal cases, supported cases, false refusal).
7. aggregate_evaluation_results (confusion matrix, PRD target PASS/FAIL checks).
"""

from typing import Any

from evaluation.metrics import (
    aggregate_evaluation_results,
    check_grounding_and_unsupported,
    compute_string_similarity,
    evaluate_single_notice,
    match_deadlines,
    match_fuzzy_items,
    normalize_deadline_date,
)


def test_compute_string_similarity() -> None:
    """Verify string similarity with normalization and containment."""
    # Identical
    assert compute_string_similarity("tax payment due", "Tax Payment Due") == 1.0
    # Both empty
    assert compute_string_similarity("", "   ") == 1.0
    # One empty
    assert compute_string_similarity("hello", "") == 0.0
    # Substring / containment
    assert compute_string_similarity("income tax demand", "tax demand") == 1.0
    # Disjoint
    sim = compute_string_similarity("apple orange", "banana strawberry")
    assert sim < 0.4


def test_normalize_deadline_date() -> None:
    """Verify ISO date normalization and sentinel handling."""
    assert normalize_deadline_date("2026-11-30") == "2026-11-30"
    assert normalize_deadline_date("2026-11-30T10:30:00Z") == "2026-11-30"
    assert normalize_deadline_date("not_found") is None
    assert normalize_deadline_date("uncertain") is None
    assert normalize_deadline_date(None) is None


def test_match_deadlines_exact_and_fuzzy() -> None:
    """Verify matching by exact date and fuzzy wording."""
    gt_deadlines = [
        {
            "date": "2026-12-31",
            "original_wording": "must be paid by 31-12-2026",
            "description": "Property tax deadline",
        },
        {
            "date": None,
            "original_wording": "within 15 days of circular receipt",
            "description": "Relative response window",
        },
    ]

    pred_deadlines = [
        {
            "date": "2026-12-31",
            "original_wording": "due by 31-12-2026",
            "description": "Tax deadline",
        },
        {
            "date": None,
            "original_wording": "within 15 days of circular receipt",
            "description": "Response window",
        },
    ]

    res = match_deadlines(gt_deadlines, pred_deadlines)
    assert res["tp"] == 2
    assert res["fp"] == 0
    assert res["fn"] == 0
    assert res["precision"] == 1.0
    assert res["recall"] == 1.0
    assert len(res["invented_deadlines"]) == 0
    assert len(res["missed_deadlines"]) == 0


def test_match_deadlines_invented_deadline_flagged() -> None:
    """Verify that a predicted deadline when GT has none counts as an invented deadline."""
    gt_deadlines: list[dict[str, Any]] = []
    pred_deadlines = [
        {
            "date": "2026-10-15",
            "original_wording": "hallucinated payment date",
            "description": "Invented deadline",
        }
    ]

    res = match_deadlines(gt_deadlines, pred_deadlines)
    assert res["tp"] == 0
    assert res["fp"] == 1
    assert res["fn"] == 0
    assert res["precision"] == 0.0
    assert len(res["invented_deadlines"]) == 1
    assert res["invented_deadlines"][0]["date"] == "2026-10-15"


def test_match_deadlines_missed_deadline_flagged() -> None:
    """Verify that a ground-truth deadline not predicted counts as a false negative."""
    gt_deadlines = [
        {
            "date": "2026-12-31",
            "original_wording": "statutory deadline",
            "description": "Mandatory cutoff",
        }
    ]
    pred_deadlines: list[dict[str, Any]] = []

    res = match_deadlines(gt_deadlines, pred_deadlines)
    assert res["tp"] == 0
    assert res["fp"] == 0
    assert res["fn"] == 1
    assert res["recall"] == 0.0
    assert len(res["missed_deadlines"]) == 1


def test_match_fuzzy_items() -> None:
    """Verify fuzzy matching for documents and action steps."""
    gt_items = [
        "Aadhaar Card copy",
        "Income Certificate from Tahsildar",
    ]
    pred_items = [
        {"name": "Copy of Aadhaar Card"},
        {"name": "Tahsildar Income Certificate"},
        {"name": "Electricity Bill Receipt"},  # Extra hallucinated doc
    ]

    res = match_fuzzy_items(gt_items, pred_items, threshold=0.60)
    assert res["tp"] == 2
    assert res["fp"] == 1  # Electricity bill
    assert res["fn"] == 0
    assert round(res["precision"], 2) == 0.67
    assert res["recall"] == 1.0


def test_check_grounding_and_unsupported() -> None:
    """Verify quote verification and unsupported critical instruction detection."""
    page_texts = [
        "Official Property Tax Notice. Payment must be completed before 31-12-2026.",
        "Penal surcharge of 2% shall be levied on all arrears.",
    ]

    # 1. Perfectly grounded notice
    valid_notice = {
        "deadlines": [
            {
                "description": "Payment deadline",
                "evidence_quote": "Payment must be completed before 31-12-2026.",
                "source_page": 1,
                "status": "found",
            }
        ],
        "penalties": [
            {
                "description": "2% surcharge",
                "evidence_quote": "Penal surcharge of 2% shall be levied",
                "source_page": 2,
                "status": "found",
            }
        ],
        "action_steps": [],
        "required_documents": [],
    }

    res_valid = check_grounding_and_unsupported(valid_notice, page_texts)
    assert res_valid["quotes_checked"] == 2
    assert res_valid["quotes_verified"] == 2
    assert res_valid["grounding_rate"] == 1.0
    assert res_valid["unsupported_critical_count"] == 0

    # 2. Hallucinated quote marked uncertain -> Allowed (NOT an unsupported offender)
    uncertain_notice = {
        "deadlines": [
            {
                "description": "Unverified date",
                "evidence_quote": "Completely imaginary text not in document",
                "source_page": 1,
                "status": "uncertain",
            }
        ],
        "penalties": [],
        "action_steps": [],
        "required_documents": [],
    }
    res_uncertain = check_grounding_and_unsupported(uncertain_notice, page_texts)
    assert res_uncertain["unsupported_critical_count"] == 0

    # 3. Hallucinated quote marked 'found' -> OFFENDER (unsupported critical instruction!)
    offender_notice = {
        "deadlines": [
            {
                "description": "Hallucinated critical instruction",
                "evidence_quote": "Fabricated clause claiming forfeiture",
                "source_page": 1,
                "status": "found",
            }
        ],
        "penalties": [],
        "action_steps": [],
        "required_documents": [],
    }
    res_offender = check_grounding_and_unsupported(offender_notice, page_texts)
    assert res_offender["unsupported_critical_count"] == 1
    assert len(res_offender["unsupported_items"]) == 1
    assert res_offender["unsupported_items"][0]["field"] == "deadline_1"


def test_evaluate_single_notice_refusal() -> None:
    """Verify evaluate_single_notice handles out_of_scope and unreadable refusals correctly."""
    annotation = {
        "notice_id": "recipe_test",
        "expected_category": "other_out_of_scope",
        "expected_status": "out_of_scope",
        "explicit_deadlines": [],
        "required_documents": [],
        "action_steps": [],
    }
    prediction = {
        "status": "out_of_scope",
        "category": "other_out_of_scope",
        "result": None,
    }

    eval_res = evaluate_single_notice(
        annotation=annotation,
        pred=prediction,
        page_texts=["Recipe text"],
        elapsed_time_sec=0.05,
    )

    assert eval_res["category_match"] is True
    assert eval_res["is_refusal_case"] is True
    assert eval_res["refusal_correct"] is True
    assert eval_res["false_refusal"] is None
    assert eval_res["deadlines"]["tp"] == 0


def test_aggregate_evaluation_results() -> None:
    """Verify aggregation across multiple notice evaluation outputs."""
    eval_list = [
        {
            "notice_id": "n1",
            "elapsed_time_sec": 1.5,
            "expected_category": "tax_or_payment",
            "predicted_category": "tax_or_payment",
            "category_match": True,
            "expected_status": "processed",
            "predicted_status": "success",
            "is_refusal_case": False,
            "refusal_correct": None,
            "false_refusal": False,
            "deadlines": {"tp": 1, "fp": 0, "fn": 0, "matches": [], "invented_deadlines": []},
            "documents": {"tp": 2, "fp": 0, "fn": 0, "matches": [], "unmatched_gt": [], "unmatched_pred": []},
            "action_steps": {"tp": 3, "fp": 0, "fn": 0, "matches": [], "unmatched_gt": [], "unmatched_pred": []},
            "submission_channel_match": True,
            "grounding": {"quotes_checked": 4, "quotes_verified": 4, "unsupported_count": 0, "unsupported_items": []},
            "uncertainty_handled": None,
        },
        {
            "notice_id": "n2",
            "elapsed_time_sec": 0.5,
            "expected_category": "other_out_of_scope",
            "predicted_category": "other_out_of_scope",
            "category_match": True,
            "expected_status": "out_of_scope",
            "predicted_status": "out_of_scope",
            "is_refusal_case": True,
            "refusal_correct": True,
            "false_refusal": None,
            "deadlines": {"tp": 0, "fp": 0, "fn": 0, "matches": [], "invented_deadlines": []},
            "documents": {"tp": 0, "fp": 0, "fn": 0, "matches": [], "unmatched_gt": [], "unmatched_pred": []},
            "action_steps": {"tp": 0, "fp": 0, "fn": 0, "matches": [], "unmatched_gt": [], "unmatched_pred": []},
            "submission_channel_match": True,
            "grounding": {"quotes_checked": 0, "quotes_verified": 0, "unsupported_count": 0, "unsupported_items": []},
            "uncertainty_handled": None,
        },
    ]

    agg = aggregate_evaluation_results(eval_list, prompt_version="1.0.0")
    summary = agg["summary"]
    targets = agg["targets_vs_measured"]

    assert agg["sample_size"] == 2
    assert summary["classification_accuracy"] == 1.0
    assert summary["deadline_precision"] == 1.0
    assert summary["combined_action_precision"] == 1.0
    assert summary["combined_action_recall"] == 1.0
    assert summary["unsupported_critical_count"] == 0

    # Verify PRD targets dictionary
    assert targets["classification_accuracy"]["passed"] is True
    assert targets["critical_deadline_precision"]["passed"] is True
    assert targets["required_action_precision"]["passed"] is True
    assert targets["required_action_recall"]["passed"] is True
    assert targets["unsupported_critical_instructions"]["passed"] is True
    assert targets["processing_time"]["passed"] is True
