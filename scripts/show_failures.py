#!/usr/bin/env python3
"""Show benchmark evaluation failures and discrepancies side-by-side.

Reads evaluation/results/latest.json (or specified path), identifies any
mismatched categories, statuses, missed or invented deadlines, missing documents,
action step gaps, and unsupported critical instructions, and prints side-by-side
comparisons alongside source passages.

Usage:
    python scripts/show_failures.py
    python scripts/show_failures.py --notice-id tax_or_payment
    python scripts/show_failures.py --results evaluation/results/latest.json
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# Ensure stdout handles Windows console encoding safely
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def format_side_by_side(expected: str, predicted: str, label: str = "") -> str:
    """Format expected vs predicted values cleanly."""
    return f"  {label:<22} | Expected: {expected}\n  {'':<22} | Predicted: {predicted}"


def inspect_notice_failures(notice_eval: dict[str, Any]) -> list[str]:
    """Inspect a single evaluated notice for any discrepancies or failures."""
    findings: list[str] = []

    # 1. Category check
    if not notice_eval.get("category_match"):
        findings.append(
            format_side_by_side(
                expected=str(notice_eval.get("expected_category")),
                predicted=str(notice_eval.get("predicted_category")),
                label="Category Mismatch",
            )
        )

    # 2. Status / Refusal check
    exp_status = notice_eval.get("expected_status")
    pred_status = notice_eval.get("predicted_status")
    if exp_status != pred_status and pred_status != "success":
        findings.append(
            format_side_by_side(
                expected=str(exp_status),
                predicted=str(pred_status),
                label="Status Mismatch",
            )
        )

    # 3. Deadlines check
    dl = notice_eval.get("deadlines", {})
    missed_dl = dl.get("missed_deadlines", [])
    invented_dl = dl.get("invented_deadlines", [])

    if missed_dl:
        findings.append("  [DEADLINE GAP] Missed Ground-Truth Deadlines:")
        for idx, m in enumerate(missed_dl, 1):
            findings.append(
                f"    {idx}. Date: {m.get('date')} | Wording: \"{m.get('original_wording')}\" | Desc: {m.get('description')}"
            )

    if invented_dl:
        findings.append("  [HALLUCINATION] Invented / False Positive Deadlines:")
        for idx, inv in enumerate(invented_dl, 1):
            findings.append(
                f"    {idx}. Date: {inv.get('date')} | Wording: \"{inv.get('original_wording') or inv.get('description')}\""
            )
            findings.append(
                f"       Citation: Page {inv.get('source_page')} | Quote: \"{inv.get('evidence_quote')}\""
            )
            findings.append("       Reason: No corresponding deadline exists in ground-truth annotation.")

    # 4. Documents check
    docs = notice_eval.get("documents", {})
    unmatched_gt_docs = docs.get("unmatched_gt", [])
    unmatched_pred_docs = docs.get("unmatched_pred", [])

    if unmatched_gt_docs:
        findings.append("  [DOCUMENT GAP] Missed Required Documents:")
        for idx, doc in enumerate(unmatched_gt_docs, 1):
            doc_str = doc if isinstance(doc, str) else doc.get("name")
            findings.append(f"    {idx}. \"{doc_str}\"")

    if unmatched_pred_docs:
        findings.append("  [DOCUMENT EXTRA] Unmatched Predicted Documents:")
        for idx, doc in enumerate(unmatched_pred_docs, 1):
            doc_str = doc if isinstance(doc, str) else doc.get("name")
            findings.append(f"    {idx}. \"{doc_str}\"")

    # 5. Action Steps check
    steps = notice_eval.get("action_steps", {})
    unmatched_gt_steps = steps.get("unmatched_gt", [])
    unmatched_pred_steps = steps.get("unmatched_pred", [])

    if unmatched_gt_steps:
        findings.append("  [ACTION STEP GAP] Missed Action Steps:")
        for idx, step in enumerate(unmatched_gt_steps, 1):
            s_str = step if isinstance(step, str) else step.get("action") or step.get("description")
            findings.append(f"    {idx}. \"{s_str}\"")

    if unmatched_pred_steps:
        findings.append("  [ACTION STEP EXTRA] Unmatched Predicted Steps:")
        for idx, step in enumerate(unmatched_pred_steps, 1):
            s_str = step if isinstance(step, str) else step.get("action") or step.get("description")
            findings.append(f"    {idx}. \"{s_str}\"")

    # 6. Submission channel
    if notice_eval.get("submission_channel_match") is False:
        findings.append("  [CHANNEL MISMATCH] Submission channel was not matched with expected portal/location.")

    # 7. Unsupported critical instructions
    grounding = notice_eval.get("grounding", {})
    unsupported = grounding.get("unsupported_items", [])
    if unsupported:
        findings.append(f"  [UNSUPPORTED CRITICAL] {len(unsupported)} ungrounded instruction(s) marked 'found':")
        for idx, item in enumerate(unsupported, 1):
            findings.append(
                f"    {idx}. Field: {item.get('field')} | Status: {item.get('status')} | Reason: {item.get('reason')}"
            )

    return findings


def main() -> None:
    """CLI entrypoint for showing evaluation benchmark failures."""
    parser = argparse.ArgumentParser(
        description="Inspect benchmark evaluation failures and discrepancies side-by-side"
    )
    parser.add_argument(
        "--results",
        type=Path,
        default=PROJECT_ROOT / "evaluation" / "results" / "latest.json",
        help="Path to evaluation latest.json results file",
    )
    parser.add_argument(
        "--notice-id",
        type=str,
        default=None,
        help="Filter inspection to a specific notice ID",
    )

    args = parser.parse_args()

    if not args.results.exists():
        print(f"[FAIL] Evaluation results file not found at: {args.results}")
        print("Please run the benchmark first using: python evaluation/run_eval.py --fake")
        sys.exit(1)

    with open(args.results, encoding="utf-8") as f:
        results = json.load(f)

    per_notice = results.get("per_notice", [])
    if not per_notice:
        print("[INFO] No per-notice evaluation records found in results.")
        sys.exit(0)

    if args.notice_id:
        per_notice = [n for n in per_notice if n.get("notice_id") == args.notice_id]
        if not per_notice:
            print(f"[INFO] Notice ID '{args.notice_id}' was not found in evaluation records.")
            sys.exit(0)

    print("=" * 75)
    print("NOTICE TO ACTION - BENCHMARK FAILURE ANALYSIS")
    print(f"Results File : {args.results}")
    print(f"Prompt Ver.  : {results.get('metadata', {}).get('prompt_version', 'N/A')}")
    print(f"Mode         : {results.get('metadata', {}).get('mode', 'N/A')}")
    print("=" * 75)

    failure_count = 0

    for notice in per_notice:
        nid = notice.get("notice_id")
        issues = inspect_notice_failures(notice)
        if issues:
            failure_count += 1
            print(f"\n[FAIL] Notice ID: {nid}")
            print("-" * 50)
            for line in issues:
                print(line)
        else:
            print(f"\n[PASS] Notice ID: {nid} (All categories, deadlines, and claims verified)")

    print("\n" + "=" * 75)
    if failure_count == 0:
        print(f"[OK] No failures or discrepancies detected across {len(per_notice)} evaluated notice(s).")
    else:
        print(f"[WARN] {failure_count} of {len(per_notice)} notice(s) exhibited discrepancies or gaps.")
    print("=" * 75)


if __name__ == "__main__":
    main()
