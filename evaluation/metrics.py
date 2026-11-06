"""Evaluation metric functions for Notice to Action.

Computes classification accuracy, correct/false refusal rates, deadline precision/recall,
document and action step fuzzy matching, grounding rates, unsupported critical instructions,
and uncertainty behavior against PRD Section 9 targets.
"""

import statistics
from difflib import SequenceMatcher
from typing import Any

from validation.validator import normalize_text

# Documented matching thresholds
FUZZY_DOC_SIMILARITY_THRESHOLD = 0.70
FUZZY_STEP_SIMILARITY_THRESHOLD = 0.60
FUZZY_CHANNEL_SIMILARITY_THRESHOLD = 0.60

PRD_TARGETS = {
    "classification_accuracy": 0.90,
    "deadline_precision": 0.95,
    "action_precision": 0.85,
    "action_recall": 0.85,
    "unsupported_critical_instructions": 0,
    "max_processing_time_sec": 60.0,
}


def compute_string_similarity(str1: str, str2: str) -> float:
    """Compute normalized lexical sequence similarity between two strings.

    Takes the maximum of character-level SequenceMatcher ratio and token-level
    Jaccard similarity to handle word order variations cleanly.
    """
    s1 = normalize_text(str1)
    s2 = normalize_text(str2)
    if not s1 and not s2:
        return 1.0
    if not s1 or not s2:
        return 0.0
    if s1 == s2 or s1 in s2 or s2 in s1:
        return 1.0

    seq_sim = SequenceMatcher(None, s1, s2).ratio()

    # Token-level overlap for word-order invariance
    tokens1 = set(s1.split())
    tokens2 = set(s2.split())
    if tokens1 and tokens2:
        token_sim = len(tokens1 & tokens2) / len(tokens1 | tokens2)
        return max(seq_sim, token_sim)

    return seq_sim


def normalize_deadline_date(date_val: Any) -> str | None:
    """Normalize date representation for strict comparison."""
    if not date_val or date_val in ("not_found", "uncertain"):
        return None
    s = str(date_val).strip()
    return s[:10] if len(s) >= 10 else s


def match_deadlines(
    gt_deadlines: list[dict[str, Any]],
    pred_deadlines: list[dict[str, Any]],
) -> dict[str, Any]:
    """Match ground-truth deadlines against predicted deadlines.

    Matches by:
    1. Exact normalized ISO calendar date (if both present).
    2. High fuzzy lexical similarity (>0.80) on original wording.

    A predicted deadline when ground-truth has none is an 'invented deadline' (False Positive).

    Returns:
        dict with tp, fp, fn, precision, recall, matches, invented_deadlines, missed_deadlines.
    """
    gt_unmatched = list(enumerate(gt_deadlines))
    pred_unmatched = list(enumerate(pred_deadlines))

    matches: list[dict[str, Any]] = []

    # 1. Match by normalized ISO date
    for gt_idx, gt_dl in list(gt_unmatched):
        gt_date = normalize_deadline_date(gt_dl.get("date"))
        if not gt_date:
            continue
        for pred_idx, pred_dl in list(pred_unmatched):
            pred_date = normalize_deadline_date(pred_dl.get("date"))
            if pred_date and pred_date == gt_date:
                matches.append(
                    {
                        "gt": gt_dl,
                        "pred": pred_dl,
                        "match_type": "exact_date",
                        "score": 1.0,
                    }
                )
                gt_unmatched = [item for item in gt_unmatched if item[0] != gt_idx]
                pred_unmatched = [item for item in pred_unmatched if item[0] != pred_idx]
                break

    # 2. Match remaining by original wording similarity
    for gt_idx, gt_dl in list(gt_unmatched):
        gt_wording = gt_dl.get("original_wording") or gt_dl.get("description") or ""
        best_pred = None
        best_pred_idx = None
        best_score = 0.0

        for pred_idx, pred_dl in pred_unmatched:
            pred_wording = (
                pred_dl.get("original_wording")
                or pred_dl.get("original_text")
                or pred_dl.get("description")
                or ""
            )
            sim = compute_string_similarity(gt_wording, pred_wording)
            if sim > best_score and sim >= 0.70:
                best_score = sim
                best_pred = pred_dl
                best_pred_idx = pred_idx

        if best_pred is not None and best_pred_idx is not None:
            matches.append(
                {
                    "gt": gt_dl,
                    "pred": best_pred,
                    "match_type": "text_similarity",
                    "score": round(best_score, 3),
                }
            )
            gt_unmatched = [item for item in gt_unmatched if item[0] != gt_idx]
            pred_unmatched = [item for item in pred_unmatched if item[0] != best_pred_idx]

    tp = len(matches)
    fn = len(gt_unmatched)
    fp = len(pred_unmatched)

    precision = tp / (tp + fp) if (tp + fp) > 0 else (1.0 if len(gt_deadlines) == 0 else 0.0)
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0

    invented = [pred_dl for _, pred_dl in pred_unmatched]
    missed = [gt_dl for _, gt_dl in gt_unmatched]

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "matches": matches,
        "invented_deadlines": invented,
        "missed_deadlines": missed,
    }


def match_fuzzy_items(
    gt_items: list[Any],
    pred_items: list[Any],
    threshold: float,
    gt_text_extractor: Any = None,
    pred_text_extractor: Any = None,
) -> dict[str, Any]:
    """Greedy bipartite fuzzy matching between ground-truth and predicted lists."""
    def default_extract(item: Any) -> str:
        if isinstance(item, str):
            return item
        if isinstance(item, dict):
            return item.get("name") or item.get("description") or item.get("instruction") or str(item)
        return str(item)

    get_gt_text = gt_text_extractor or default_extract
    get_pred_text = pred_text_extractor or default_extract

    gt_unmatched = list(enumerate(gt_items))
    pred_unmatched = list(enumerate(pred_items))
    matches: list[dict[str, Any]] = []

    # Sort pairs by highest similarity
    candidate_pairs: list[tuple[float, int, int]] = []
    for gt_idx, gt_item in gt_unmatched:
        gt_t = get_gt_text(gt_item)
        for pred_idx, pred_item in pred_unmatched:
            pred_t = get_pred_text(pred_item)
            sim = compute_string_similarity(gt_t, pred_t)
            if sim >= threshold:
                candidate_pairs.append((sim, gt_idx, pred_idx))

    candidate_pairs.sort(key=lambda x: x[0], reverse=True)

    matched_gt: set[int] = set()
    matched_pred: set[int] = set()

    for sim, gt_idx, pred_idx in candidate_pairs:
        if gt_idx not in matched_gt and pred_idx not in matched_pred:
            matched_gt.add(gt_idx)
            matched_pred.add(pred_idx)
            matches.append(
                {
                    "gt": gt_items[gt_idx],
                    "pred": pred_items[pred_idx],
                    "score": round(sim, 3),
                }
            )

    tp = len(matches)
    fn = len(gt_items) - tp
    fp = len(pred_items) - tp

    precision = tp / (tp + fp) if (tp + fp) > 0 else (1.0 if len(gt_items) == 0 else 0.0)
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "matches": matches,
        "unmatched_gt": [item for idx, item in gt_unmatched if idx not in matched_gt],
        "unmatched_pred": [item for idx, item in pred_unmatched if idx not in matched_pred],
    }


def check_grounding_and_unsupported(
    pred_result: dict[str, Any] | None,
    page_texts: list[str],
    notice_id: str = "",
) -> dict[str, Any]:
    """Verify evidence quotes and identify unsupported critical instructions.

    An item is unsupported if:
    - It is a critical instruction/claim
    - Its quote is not found on the cited page (or page is invalid)
    - AND it is NOT marked uncertain.

    Target = 0.
    """
    if not pred_result or not isinstance(pred_result, dict):
        return {
            "quotes_checked": 0,
            "quotes_verified": 0,
            "grounding_rate": 1.0,
            "unsupported_critical_count": 0,
            "unsupported_items": [],
        }

    normalized_pages = [normalize_text(p) for p in page_texts]
    total_pages = len(normalized_pages)

    quotes_checked = 0
    quotes_verified = 0
    unsupported_items: list[dict[str, Any]] = []

    def inspect_field(item: Any, field_name: str, is_critical: bool) -> None:
        nonlocal quotes_checked, quotes_verified
        if not isinstance(item, dict):
            return

        quote = item.get("evidence_quote")
        page = item.get("source_page")
        status = item.get("status")

        if quote in (None, "not_found", "uncertain") or page in (None, "not_found", "uncertain"):
            if is_critical and status == "found":
                # Marked found without evidence and not uncertain
                unsupported_items.append(
                    {
                        "notice_id": notice_id,
                        "field": field_name,
                        "reason": "Marked 'found' without quote or page citation",
                        "status": status,
                    }
                )
            return

        valid_page = type(page) is int and 1 <= page <= total_pages
        quotes_checked += 1

        is_grounded = False
        if valid_page:
            norm_q = normalize_text(str(quote))
            if norm_q and norm_q in normalized_pages[page - 1]:
                quotes_verified += 1
                is_grounded = True

        if is_critical and not is_grounded and status != "uncertain":
            unsupported_items.append(
                {
                    "notice_id": notice_id,
                    "field": field_name,
                    "page": page,
                    "quote": str(quote)[:80] if quote else None,
                    "reason": "Evidence quote not found verbatim on cited page and not marked uncertain",
                    "status": status,
                }
            )

    # Inspect top-level critical fields
    for f in ("notice_title", "issuing_organisation", "affected_party", "main_purpose"):
        if f in pred_result:
            inspect_field(pred_result[f], f, is_critical=True)

    if "submission_channel" in pred_result:
        inspect_field(pred_result["submission_channel"], "submission_channel", is_critical=True)

    for idx, dl in enumerate(pred_result.get("deadlines") or []):
        inspect_field(dl, f"deadline_{idx + 1}", is_critical=True)

    for idx, doc in enumerate(pred_result.get("required_documents") or []):
        name = doc.get("name") if isinstance(doc, dict) else f"doc_{idx + 1}"
        inspect_field(doc, f"required_document: {name}", is_critical=True)

    for idx, step in enumerate(pred_result.get("action_steps") or []):
        inspect_field(step, f"action_step_{idx + 1}", is_critical=True)

    for idx, pen in enumerate(pred_result.get("penalties") or []):
        inspect_field(pen, f"penalty_{idx + 1}", is_critical=True)

    grounding_rate = (quotes_verified / quotes_checked) if quotes_checked > 0 else 1.0

    return {
        "quotes_checked": quotes_checked,
        "quotes_verified": quotes_verified,
        "grounding_rate": round(grounding_rate, 4),
        "unsupported_critical_count": len(unsupported_items),
        "unsupported_items": unsupported_items,
    }


def evaluate_single_notice(
    annotation: dict[str, Any],
    pred: dict[str, Any],
    page_texts: list[str],
    elapsed_time_sec: float,
) -> dict[str, Any]:
    """Calculate all metric scores for an individual notice."""
    notice_id = annotation.get("notice_id", "unnamed")
    exp_cat = annotation.get("expected_category")
    exp_status = annotation.get("expected_status")

    pred_cat = pred.get("category")
    pred_status = pred.get("status")

    # Normalize category: if refusal, category is other_out_of_scope
    if pred_status == "out_of_scope" and not pred_cat:
        pred_cat = "other_out_of_scope"

    cat_match = exp_cat == pred_cat

    # Refusal logic
    is_refusal_case = exp_status in ("needs_clearer_document", "out_of_scope")
    is_supported_case = exp_status == "processed"

    refusal_correct = None
    false_refusal = None

    if is_refusal_case:
        refusal_correct = pred_status == exp_status
    elif is_supported_case:
        false_refusal = pred_status in ("needs_clearer_document", "out_of_scope")

    pred_result = pred.get("result") or {}

    # Deadlines match
    gt_deadlines = annotation.get("explicit_deadlines") or []
    pred_deadlines = pred_result.get("deadlines") or []
    deadline_eval = match_deadlines(gt_deadlines, pred_deadlines)

    # Documents match
    gt_docs = annotation.get("required_documents") or []
    pred_docs = pred_result.get("required_documents") or []
    doc_eval = match_fuzzy_items(gt_docs, pred_docs, threshold=FUZZY_DOC_SIMILARITY_THRESHOLD)

    # Action steps match
    gt_steps = annotation.get("action_steps") or []
    pred_steps = pred_result.get("action_steps") or []
    step_eval = match_fuzzy_items(gt_steps, pred_steps, threshold=FUZZY_STEP_SIMILARITY_THRESHOLD)

    # Submission channel match
    gt_chan = annotation.get("submission_channel")
    pred_chan_raw = pred_result.get("submission_channel")
    pred_chan = (
        pred_chan_raw.get("value") or pred_chan_raw.get("channel")
        if isinstance(pred_chan_raw, dict)
        else pred_chan_raw
    )
    if not gt_chan and not pred_chan:
        chan_match = True
    elif gt_chan and pred_chan:
        chan_match = compute_string_similarity(gt_chan, pred_chan) >= FUZZY_CHANNEL_SIMILARITY_THRESHOLD
    else:
        chan_match = False

    # Grounding & unsupported critical instructions
    grounding_eval = check_grounding_and_unsupported(pred_result, page_texts, notice_id=notice_id)

    # Uncertainty handling
    has_expected_ambiguity = (
        bool(
            annotation.get("ambiguous_or_missing_notes")
            and "unambiguous" not in str(annotation.get("ambiguous_or_missing_notes")).lower()
        )
        or any(dl.get("is_ambiguous") for dl in gt_deadlines if isinstance(dl, dict))
    )
    uncertainty_handled = None
    if has_expected_ambiguity and pred_result:
        # Check if any deadline or item was marked uncertain or ambiguous
        any_uncertain = (
            pred.get("needs_verification") is True
            or any(
                dl.get("status") in ("uncertain", "ambiguous") or dl.get("is_ambiguous_or_conflicting")
                for dl in pred_deadlines
            )
            or any(d.get("status") in ("uncertain", "needs_verification") for d in pred_docs if isinstance(d, dict))
        )
        uncertainty_handled = any_uncertain

    return {
        "notice_id": notice_id,
        "elapsed_time_sec": round(elapsed_time_sec, 2),
        "expected_category": exp_cat,
        "predicted_category": pred_cat,
        "category_match": cat_match,
        "expected_status": exp_status,
        "predicted_status": pred_status,
        "is_refusal_case": is_refusal_case,
        "refusal_correct": refusal_correct,
        "false_refusal": false_refusal,
        "deadlines": deadline_eval,
        "documents": doc_eval,
        "action_steps": step_eval,
        "submission_channel_match": chan_match,
        "grounding": grounding_eval,
        "uncertainty_handled": uncertainty_handled,
    }


def aggregate_evaluation_results(
    eval_list: list[dict[str, Any]],
    prompt_version: str = "1.0.0",
) -> dict[str, Any]:
    """Aggregate per-notice metrics into comprehensive benchmark results."""
    total_notices = len(eval_list)
    if total_notices == 0:
        return {"total_notices": 0, "summary": {}, "targets": {}}

    # Classification & Confusion Matrix
    correct_cat = sum(1 for e in eval_list if e["category_match"])
    cat_accuracy = correct_cat / total_notices

    confusion_matrix: dict[str, dict[str, int]] = {}
    per_category: dict[str, dict[str, Any]] = {}

    for e in eval_list:
        gt_c = e["expected_category"] or "unknown"
        pr_c = e["predicted_category"] or "unknown"

        if gt_c not in confusion_matrix:
            confusion_matrix[gt_c] = {}
        confusion_matrix[gt_c][pr_c] = confusion_matrix[gt_c].get(pr_c, 0) + 1

        if gt_c not in per_category:
            per_category[gt_c] = {"total": 0, "correct": 0}
        per_category[gt_c]["total"] += 1
        if e["category_match"]:
            per_category[gt_c]["correct"] += 1

    # Refusal rates
    refusal_cases = [e for e in eval_list if e["is_refusal_case"]]
    correct_refusals = sum(1 for e in refusal_cases if e["refusal_correct"])
    correct_refusal_rate = (
        (correct_refusals / len(refusal_cases)) if refusal_cases else 1.0
    )

    supported_cases = [e for e in eval_list if not e["is_refusal_case"]]
    false_refusals = sum(1 for e in supported_cases if e["false_refusal"])
    false_refusal_rate = (
        (false_refusals / len(supported_cases)) if supported_cases else 0.0
    )

    # Deadlines aggregation
    total_dl_tp = sum(e["deadlines"]["tp"] for e in eval_list)
    total_dl_fp = sum(e["deadlines"]["fp"] for e in eval_list)
    total_dl_fn = sum(e["deadlines"]["fn"] for e in eval_list)
    dl_precision = (
        (total_dl_tp / (total_dl_tp + total_dl_fp)) if (total_dl_tp + total_dl_fp) > 0 else 1.0
    )
    dl_recall = (
        (total_dl_tp / (total_dl_tp + total_dl_fn)) if (total_dl_tp + total_dl_fn) > 0 else 1.0
    )
    invented_deadlines = [
        {"notice_id": e["notice_id"], "deadline": inv}
        for e in eval_list
        for inv in e["deadlines"]["invented_deadlines"]
    ]

    # Required Documents aggregation
    total_doc_tp = sum(e["documents"]["tp"] for e in eval_list)
    total_doc_fp = sum(e["documents"]["fp"] for e in eval_list)
    total_doc_fn = sum(e["documents"]["fn"] for e in eval_list)
    doc_precision = (
        (total_doc_tp / (total_doc_tp + total_doc_fp)) if (total_doc_tp + total_doc_fp) > 0 else 1.0
    )
    doc_recall = (
        (total_doc_tp / (total_doc_tp + total_doc_fn)) if (total_doc_tp + total_doc_fn) > 0 else 1.0
    )

    # Action Steps aggregation
    total_step_tp = sum(e["action_steps"]["tp"] for e in eval_list)
    total_step_fp = sum(e["action_steps"]["fp"] for e in eval_list)
    total_step_fn = sum(e["action_steps"]["fn"] for e in eval_list)
    step_precision = (
        (total_step_tp / (total_step_tp + total_step_fp))
        if (total_step_tp + total_step_fp) > 0
        else 1.0
    )
    step_recall = (
        (total_step_tp / (total_step_tp + total_step_fn))
        if (total_step_tp + total_step_fn) > 0
        else 1.0
    )

    # Combined Required Action Precision & Recall (documents + action steps)
    action_tp = total_doc_tp + total_step_tp
    action_fp = total_doc_fp + total_step_fp
    action_fn = total_doc_fn + total_step_fn
    action_precision = (
        (action_tp / (action_tp + action_fp)) if (action_tp + action_fp) > 0 else 1.0
    )
    action_recall = (
        (action_tp / (action_tp + action_fn)) if (action_tp + action_fn) > 0 else 1.0
    )

    # Submission channel match rate
    chan_matches = sum(1 for e in eval_list if e["submission_channel_match"])
    chan_rate = chan_matches / total_notices

    # Grounding & unsupported critical count
    total_quotes_checked = sum(e["grounding"]["quotes_checked"] for e in eval_list)
    total_quotes_verified = sum(e["grounding"]["quotes_verified"] for e in eval_list)
    overall_grounding_rate = (
        (total_quotes_verified / total_quotes_checked) if total_quotes_checked > 0 else 1.0
    )

    all_unsupported = [
        item for e in eval_list for item in e["grounding"]["unsupported_items"]
    ]
    unsupported_count = len(all_unsupported)

    # Uncertainty handling rate
    uncertainty_evals = [e for e in eval_list if e["uncertainty_handled"] is not None]
    uncertainty_adherence = (
        (sum(1 for e in uncertainty_evals if e["uncertainty_handled"]) / len(uncertainty_evals))
        if uncertainty_evals
        else 1.0
    )

    # Processing times
    times = [e["elapsed_time_sec"] for e in eval_list]
    mean_time = statistics.mean(times) if times else 0.0
    median_time = statistics.median(times) if times else 0.0
    max_time = max(times) if times else 0.0
    count_over_60 = sum(1 for t in times if t > 60.0)

    # Target comparison
    target_results = {
        "classification_accuracy": {
            "target": ">= 90%",
            "measured": f"{cat_accuracy * 100:.1f}%",
            "passed": cat_accuracy >= PRD_TARGETS["classification_accuracy"],
        },
        "critical_deadline_precision": {
            "target": ">= 95%",
            "measured": f"{dl_precision * 100:.1f}%",
            "passed": dl_precision >= PRD_TARGETS["deadline_precision"],
        },
        "required_action_precision": {
            "target": ">= 85%",
            "measured": f"{action_precision * 100:.1f}%",
            "passed": action_precision >= PRD_TARGETS["action_precision"],
        },
        "required_action_recall": {
            "target": ">= 85%",
            "measured": f"{action_recall * 100:.1f}%",
            "passed": action_recall >= PRD_TARGETS["action_recall"],
        },
        "unsupported_critical_instructions": {
            "target": "= 0",
            "measured": f"{unsupported_count}",
            "passed": unsupported_count == PRD_TARGETS["unsupported_critical_instructions"],
        },
        "processing_time": {
            "target": "<= 60.0s max",
            "measured": f"{max_time:.1f}s (max)",
            "passed": count_over_60 == 0,
        },
    }

    return {
        "prompt_version": prompt_version,
        "sample_size": total_notices,
        "summary": {
            "classification_accuracy": round(cat_accuracy, 4),
            "classification_correct": correct_cat,
            "classification_total": total_notices,
            "confusion_matrix": confusion_matrix,
            "per_category": per_category,
            "correct_refusal_rate": round(correct_refusal_rate, 4),
            "correct_refusals": correct_refusals,
            "total_refusal_cases": len(refusal_cases),
            "false_refusal_rate": round(false_refusal_rate, 4),
            "false_refusals": false_refusals,
            "total_supported_cases": len(supported_cases),
            "deadline_precision": round(dl_precision, 4),
            "deadline_recall": round(dl_recall, 4),
            "deadline_tp": total_dl_tp,
            "deadline_fp": total_dl_fp,
            "deadline_fn": total_dl_fn,
            "invented_deadlines": invented_deadlines,
            "document_precision": round(doc_precision, 4),
            "document_recall": round(doc_recall, 4),
            "document_tp": total_doc_tp,
            "document_fp": total_doc_fp,
            "document_fn": total_doc_fn,
            "action_step_precision": round(step_precision, 4),
            "action_step_recall": round(step_recall, 4),
            "action_step_tp": total_step_tp,
            "action_step_fp": total_step_fp,
            "action_step_fn": total_step_fn,
            "combined_action_precision": round(action_precision, 4),
            "combined_action_recall": round(action_recall, 4),
            "submission_channel_match_rate": round(chan_rate, 4),
            "grounding_rate": round(overall_grounding_rate, 4),
            "quotes_verified": total_quotes_verified,
            "quotes_checked": total_quotes_checked,
            "unsupported_critical_count": unsupported_count,
            "unsupported_offenders": all_unsupported,
            "uncertainty_adherence_rate": round(uncertainty_adherence, 4),
            "processing_time": {
                "mean_sec": round(mean_time, 2),
                "median_sec": round(median_time, 2),
                "max_sec": round(max_time, 2),
                "count_over_60s": count_over_60,
            },
        },
        "targets_vs_measured": target_results,
        "per_notice": eval_list,
    }
