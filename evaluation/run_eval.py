"""Notice to Action - Evaluation Benchmark Runner (Phase 6).

Executes the pipeline on annotated notices in data/annotations/, computes
comprehensive metrics against PRD Section 9 targets, manages raw model cache,
and outputs both machine-readable JSON (evaluation/results/latest.json)
and a human-readable markdown report (evaluation/results/report.md).
"""

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# Ensure stdout handles Windows console encoding safely
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from evaluation.metrics import (  # noqa: E402
    aggregate_evaluation_results,
    evaluate_single_notice,
)
from extraction.extractor import extract_pages  # noqa: E402
from extraction.llm_client import FakeLLMClient, GeminiLLMClient  # noqa: E402
from extraction.llm_extractor import PROMPT_VERSION  # noqa: E402
from extraction.pipeline import process_notice  # noqa: E402
from validation.validator import normalize_text  # noqa: E402


def compute_pdf_sha256(pdf_path: Path) -> str:
    """Compute SHA-256 hash of PDF file bytes."""
    with open(pdf_path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def build_fake_canned_notice(
    annotation: dict[str, Any],
    pages: list[dict[str, Any]],
) -> dict[str, Any]:
    """Construct deterministic canned LLM response aligned with ground-truth annotation.

    Used when running in --fake mode to enable deterministic offline evaluation.
    Evidence quotes and page numbers are sourced from critical_evidence_passages
    to verify grounding against the real PDF text.
    """
    ev_passages = {
        p.get("field"): p for p in annotation.get("critical_evidence_passages", [])
    }

    title_ev = ev_passages.get("notice_title") or {}
    deadline_ev = ev_passages.get("deadline") or {}
    channel_ev = ev_passages.get("submission_channel") or {}
    penalty_ev = ev_passages.get("penalty") or {}

    deadlines = []
    for _idx, dl in enumerate(annotation.get("explicit_deadlines", [])):
        quote = deadline_ev.get("quote") or dl.get("original_wording")
        page = deadline_ev.get("page") or 1
        deadlines.append(
            {
                "date": dl.get("date"),
                "description": dl.get("description") or dl.get("original_wording") or "Deadline",
                "evidence_quote": quote,
                "source_page": page,
                "confidence": 0.95,
                "is_ambiguous_or_conflicting": dl.get("is_ambiguous", False),
                "ambiguity_reason": dl.get("ambiguity_reason"),
                "status": "found",
            }
        )

    required_docs = []
    for doc in annotation.get("required_documents", []):
        matched_quote = None
        matched_page = None
        norm_doc = normalize_text(doc)
        for p in pages:
            p_text = p.get("text", "")
            norm_p = normalize_text(p_text)
            if norm_doc in norm_p:
                matched_quote = doc
                matched_page = p.get("page_number", 1)
                break
        required_docs.append(
            {
                "name": doc,
                "is_required": True,
                "evidence_quote": matched_quote or "not_found",
                "source_page": matched_page or "not_found",
                "status": "not_completed" if matched_quote else "needs_verification",
            }
        )

    action_steps = []
    for idx, step in enumerate(annotation.get("action_steps", [])):
        matched_quote = None
        matched_page = None
        norm_step = normalize_text(step)
        for p in pages:
            p_text = p.get("text", "")
            norm_p = normalize_text(p_text)
            if norm_step in norm_p:
                matched_quote = step
                matched_page = p.get("page_number", 1)
                break
            for line in p_text.split("\n"):
                norm_line = normalize_text(line)
                if norm_line and (norm_step in norm_line or norm_line in norm_step):
                    matched_quote = line.strip()
                    matched_page = p.get("page_number", 1)
                    break
            if matched_quote:
                break

        action_steps.append(
            {
                "order": idx + 1,
                "action": step,
                "evidence_quote": matched_quote or "not_found",
                "source_page": matched_page or "not_found",
                "status": "found" if matched_quote else "uncertain",
            }
        )

    penalties = []
    for pen in annotation.get("penalties", []):
        penalties.append(
            {
                "description": pen,
                "amount": None,
                "evidence_quote": penalty_ev.get("quote") or pen,
                "source_page": penalty_ev.get("page") or 1,
                "status": "found",
            }
        )

    sub_channel = annotation.get("submission_channel")

    return {
        "notice_id": annotation.get("notice_id", "notice-eval-001"),
        "schema_version": "1.0",
        "category": annotation.get("expected_category", "tax_or_payment"),
        "notice_title": {
            "text": title_ev.get("quote") or "Official Notice",
            "evidence_quote": title_ev.get("quote") or "not_found",
            "source_page": title_ev.get("page") or "not_found",
            "status": "found" if title_ev.get("quote") else "not_found",
        },
        "issuing_organisation": {
            "text": "Competent Authority",
            "evidence_quote": "not_found",
            "source_page": "not_found",
            "status": "not_found",
        },
        "affected_party": {
            "text": "Relevant citizen or student",
            "evidence_quote": "not_found",
            "source_page": "not_found",
            "status": "not_found",
        },
        "main_purpose": {
            "text": "Official regulatory notice requirements",
            "evidence_quote": "not_found",
            "source_page": "not_found",
            "status": "not_found",
        },
        "plain_language_summary": {
            "what_is_this": "Official administrative notice requiring compliance.",
            "why_it_matters": "Failure to comply may result in statutory penalties.",
            "what_to_do": "Review the required action steps and documents.",
            "where_to_do_it": str(sub_channel or "Designated submission channel"),
            "if_deadline_missed": "Statutory surcharge or administrative action.",
        },
        "deadlines": deadlines,
        "required_documents": required_docs,
        "submission_channel": {
            "channel": sub_channel,
            "evidence_quote": channel_ev.get("quote") or (sub_channel if sub_channel else None),
            "source_page": channel_ev.get("page") or (1 if sub_channel else None),
            "status": "found" if sub_channel else "not_found",
        },
        "penalties": penalties,
        "action_steps": action_steps,
        "warnings": [],
        "needs_verification": False,
    }


def generate_markdown_report(
    eval_summary: dict[str, Any],
    run_meta: dict[str, Any],
) -> str:
    """Generate human-readable markdown evaluation report."""
    summary = eval_summary.get("summary", {})
    targets = eval_summary.get("targets_vs_measured", {})
    per_notice = eval_summary.get("per_notice", [])
    sample_size = eval_summary.get("sample_size", 0)

    lines: list[str] = []
    lines.append("# Notice to Action - Evaluation Benchmark Report")
    lines.append("")
    lines.append(f"- **Execution Timestamp**: {run_meta.get('timestamp')}")
    lines.append(f"- **Prompt Version**: `{run_meta.get('prompt_version')}`")
    lines.append(f"- **Evaluation Mode**: `{run_meta.get('mode')}`")
    lines.append(f"- **Model / Provider**: `{run_meta.get('model')}`")
    lines.append(f"- **Test Suite Size**: {sample_size} notices")
    lines.append("")
    lines.append("> [!NOTE]")
    lines.append(
        f"> **Small Sample Size Disclaimer**: This evaluation was executed on a curated test suite of {sample_size} notices. "
        "Per PRD Section 9, targets are benchmark criteria; the numbers below represent honest, objective measurements "
        "on this test suite and should be considered preliminary rather than statistically definitive claims for broad distribution."
    )
    lines.append("")

    # 1. Targets vs Measured
    lines.append("## 1. Targets vs. Measured (PRD Section 9)")
    lines.append("")
    lines.append("| Metric | Target | Measured | Target Met |")
    lines.append("|---|---|---|---|")
    for key, info in targets.items():
        name = key.replace("_", " ").title()
        status = "PASSED" if info.get("passed") else "FAILED"
        lines.append(f"| **{name}** | {info.get('target')} | {info.get('measured')} | **{status}** |")
    lines.append("")

    # 2. Classification & Refusals
    lines.append("## 2. Classification & Scope Refusal Performance")
    lines.append("")
    lines.append(f"- **Classification Accuracy**: {summary.get('classification_accuracy', 0) * 100:.1f}% ({summary.get('classification_correct', 0)}/{summary.get('classification_total', 0)})")
    lines.append(f"- **Correct Refusal Rate**: {summary.get('correct_refusal_rate', 0) * 100:.1f}% ({summary.get('correct_refusals', 0)}/{summary.get('total_refusal_cases', 0)} unreadable/out-of-scope cases refused without LLM)")
    lines.append(f"- **False Refusal Rate**: {summary.get('false_refusal_rate', 0) * 100:.1f}% ({summary.get('false_refusals', 0)}/{summary.get('total_supported_cases', 0)} supported notices wrongly refused)")
    lines.append("")
    lines.append("### Confusion Matrix")
    lines.append("")
    conf = summary.get("confusion_matrix", {})
    all_cats = sorted({cat for row in conf.values() for cat in row.keys()} | set(conf.keys()))
    if all_cats:
        header = "| Expected \\ Predicted | " + " | ".join(all_cats) + " |"
        sep = "|---| " + " | ".join(["---"] * len(all_cats)) + " |"
        lines.append(header)
        lines.append(sep)
        for exp_c in sorted(conf.keys()):
            row_vals = [str(conf[exp_c].get(p_c, 0)) for p_c in all_cats]
            lines.append(f"| **{exp_c}** | " + " | ".join(row_vals) + " |")
    lines.append("")

    # 3. Extraction Quality
    lines.append("## 3. Information Extraction Quality")
    lines.append("")
    lines.append("| Extraction Category | Precision | Recall | TP | FP | FN | Invented Count |")
    lines.append("|---|---|---|---|---|---|---|")
    lines.append(
        f"| **Explicit Deadlines** | {summary.get('deadline_precision', 0) * 100:.1f}% | {summary.get('deadline_recall', 0) * 100:.1f}% | "
        f"{summary.get('deadline_tp', 0)} | {summary.get('deadline_fp', 0)} | {summary.get('deadline_fn', 0)} | {summary.get('invented_deadlines', 0)} |"
    )
    lines.append(
        f"| **Required Documents** | {summary.get('document_precision', 0) * 100:.1f}% | {summary.get('document_recall', 0) * 100:.1f}% | "
        f"{summary.get('document_tp', 0)} | {summary.get('document_fp', 0)} | {summary.get('document_fn', 0)} | - |"
    )
    lines.append(
        f"| **Action Steps** | {summary.get('action_step_precision', 0) * 100:.1f}% | {summary.get('action_step_recall', 0) * 100:.1f}% | "
        f"{summary.get('action_step_tp', 0)} | {summary.get('action_step_fp', 0)} | {summary.get('action_step_fn', 0)} | - |"
    )
    lines.append(
        f"| **Combined Required Actions** | **{summary.get('combined_action_precision', 0) * 100:.1f}%** | **{summary.get('combined_action_recall', 0) * 100:.1f}%** | "
        f"{summary.get('document_tp', 0) + summary.get('action_step_tp', 0)} | {summary.get('document_fp', 0) + summary.get('action_step_fp', 0)} | "
        f"{summary.get('document_fn', 0) + summary.get('action_step_fn', 0)} | - |"
    )
    lines.append("")
    lines.append(f"- **Submission Channel Match Rate**: {summary.get('submission_channel_match_rate', 0) * 100:.1f}%")
    lines.append(f"- **Evidence Grounding Rate**: {summary.get('grounding_rate', 0) * 100:.1f}% ({summary.get('quotes_verified', 0)}/{summary.get('quotes_checked', 0)} quotes verified against PDF text)")
    lines.append(f"- **Unsupported Critical Instructions**: **{summary.get('unsupported_critical_count', 0)}** (PRD Target = 0)")
    lines.append(f"- **Uncertainty Handling Adherence**: {summary.get('uncertainty_adherence_rate', 0) * 100:.1f}%")
    lines.append("")

    # 4. Latency
    times = summary.get("processing_time", {})
    lines.append("## 4. Processing Time & Latency")
    lines.append("")
    lines.append(f"- **Mean**: {times.get('mean_sec', 0.0):.2f}s")
    lines.append(f"- **Median**: {times.get('median_sec', 0.0):.2f}s")
    lines.append(f"- **Max**: {times.get('max_sec', 0.0):.2f}s")
    lines.append(f"- **Over 60 seconds**: {times.get('count_over_60s', 0)}")
    lines.append("")

    # 5. Per-Notice Breakdown
    lines.append("## 5. Per-Notice Evaluation Summary")
    lines.append("")
    lines.append("| Notice ID | Exp. Category | Pred. Category | Category Match | Status | Deadlines (TP/FP/FN) | Grounding Rate | Time (s) |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for item in per_notice:
        nid = item.get("notice_id")
        ec = item.get("expected_category")
        pc = item.get("predicted_category")
        cm = "YES" if item.get("category_match") else "NO"
        st = item.get("predicted_status")
        dl = item.get("deadlines", {})
        dl_str = f"{dl.get('tp', 0)}/{dl.get('fp', 0)}/{dl.get('fn', 0)}"
        gr = item.get("grounding", {})
        gr_str = f"{gr.get('grounding_rate', 1.0) * 100:.0f}%" if gr.get("quotes_checked", 0) > 0 else "N/A"
        t_sec = item.get("elapsed_time_sec", 0.0)
        lines.append(f"| `{nid}` | `{ec}` | `{pc}` | {cm} | `{st}` | {dl_str} | {gr_str} | {t_sec:.2f}s |")
    lines.append("")

    # 6. Failure & Discrepancy Breakdown
    failures = []
    for item in per_notice:
        reasons = []
        if not item.get("category_match"):
            reasons.append(f"Category mismatch: expected '{item.get('expected_category')}', got '{item.get('predicted_category')}'")
        if item.get("deadlines", {}).get("fp", 0) > 0:
            reasons.append(f"{item['deadlines']['fp']} invented deadline(s)")
        if item.get("deadlines", {}).get("fn", 0) > 0:
            reasons.append(f"{item['deadlines']['fn']} missed deadline(s)")
        if item.get("grounding", {}).get("unsupported_count", 0) > 0:
            reasons.append(f"{item['grounding']['unsupported_count']} unsupported critical instruction(s)")
        if reasons:
            failures.append((item.get("notice_id"), reasons))

    lines.append("## 6. Failure & Discrepancy Analysis")
    lines.append("")
    if not failures:
        lines.append("No failures or discrepancies detected across evaluated notices.")
    else:
        for nid, reasons in failures:
            lines.append(f"### Notice: `{nid}`")
            for r in reasons:
                lines.append(f"- {r}")
            lines.append("")

    return "\n".join(lines)


def run_evaluation(
    annotations_dir: Path,
    cache_dir: Path,
    results_dir: Path,
    use_fake: bool = False,
    refresh_cache: bool = False,
    limit: int | None = None,
) -> dict[str, Any]:
    """Execute evaluation benchmark across all ground-truth annotations."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)

    annotation_files = sorted(annotations_dir.glob("*.json"))
    if not annotation_files:
        print(f"[FAIL] No annotation files found in {annotations_dir}")
        return {}

    if limit and limit > 0:
        annotation_files = annotation_files[:limit]

    print("=" * 70)
    print("Notice to Action - Benchmark Evaluation Runner")
    print(f"Prompt Version : {PROMPT_VERSION}")
    print(f"Annotations    : {len(annotation_files)} files in {annotations_dir}")
    print(f"Mode           : {'Deterministic Fake Client' if use_fake else 'Real LLM Client'}")
    print(f"Cache Dir      : {cache_dir} (refresh={refresh_cache})")
    print("=" * 70)

    per_notice_evals: list[dict[str, Any]] = []

    for idx, ann_file in enumerate(annotation_files, 1):
        with open(ann_file, encoding="utf-8") as f:
            annotation = json.load(f)

        notice_id = annotation.get("notice_id") or ann_file.stem
        raw_pdf_path = annotation.get("source_pdf")
        if not raw_pdf_path:
            print(f"[{idx}/{len(annotation_files)}] [SKIP] {notice_id}: No source_pdf specified.")
            continue

        pdf_path = PROJECT_ROOT / raw_pdf_path
        if not pdf_path.exists():
            print(f"[{idx}/{len(annotation_files)}] [SKIP] {notice_id}: PDF not found at {pdf_path}")
            continue

        pdf_hash = compute_pdf_sha256(pdf_path)
        cache_key = f"{pdf_hash[:16]}_{PROMPT_VERSION}.json"
        cache_file = cache_dir / cache_key

        pipeline_res: dict[str, Any] | None = None
        elapsed_sec = 0.0

        # Check cache if not in fake mode and not refreshing
        if not refresh_cache and not use_fake and cache_file.exists():
            try:
                with open(cache_file, encoding="utf-8") as cf:
                    cached_data = json.load(cf)
                    pipeline_res = cached_data.get("pipeline_result")
                    elapsed_sec = cached_data.get("elapsed_time_sec", 0.0)
                    print(f"[{idx}/{len(annotation_files)}] [CACHE] {notice_id} (hash={pdf_hash[:8]})")
            except Exception as e:
                print(f"[{idx}/{len(annotation_files)}] [WARN] Cache read failed for {notice_id}: {e}")

        # Compute pipeline prediction if not loaded from cache
        if pipeline_res is None:
            t0 = time.perf_counter()

            if use_fake:
                # In fake mode, extract pages first to check readability and classification
                pages = extract_pages(pdf_path)
                canned_notice = build_fake_canned_notice(annotation, pages)
                fake_client = FakeLLMClient(canned_notice)
                pipeline_res = process_notice(pdf_path, client=fake_client)
            else:
                real_client = GeminiLLMClient()
                pipeline_res = process_notice(pdf_path, client=real_client)

            elapsed_sec = time.perf_counter() - t0

            # Write to cache
            if not use_fake:
                try:
                    with open(cache_file, "w", encoding="utf-8") as cf:
                        json.dump(
                            {
                                "source_pdf": str(raw_pdf_path),
                                "sha256": pdf_hash,
                                "prompt_version": PROMPT_VERSION,
                                "elapsed_time_sec": round(elapsed_sec, 2),
                                "pipeline_result": pipeline_res,
                            },
                            cf,
                            indent=2,
                        )
                except Exception as e:
                    print(f"[WARN] Failed to write cache for {notice_id}: {e}")

            status_tag = "MOCK" if use_fake else "LIVE"
            print(f"[{idx}/{len(annotation_files)}] [{status_tag}] {notice_id} ({elapsed_sec:.2f}s)")

        # Extract page texts for ground-truth quote validation
        pages = extract_pages(pdf_path)
        page_texts = [p.get("text", "") for p in pages]

        # Evaluate against ground-truth
        notice_eval = evaluate_single_notice(
            annotation=annotation,
            pred=pipeline_res,
            page_texts=page_texts,
            elapsed_time_sec=elapsed_sec,
        )
        per_notice_evals.append(notice_eval)

    # Aggregate metrics
    aggregated = aggregate_evaluation_results(
        per_notice_evals,
        prompt_version=PROMPT_VERSION,
    )

    run_meta = {
        "timestamp": datetime.now().isoformat(),
        "prompt_version": PROMPT_VERSION,
        "mode": "deterministic_fake" if use_fake else "real_llm",
        "model": "FakeLLMClient" if use_fake else (os.getenv("LLM_MODEL") or "gemini-1.5-flash"),
        "sample_size": len(per_notice_evals),
    }

    full_results = {
        "metadata": run_meta,
        **aggregated,
    }

    # Save latest.json
    latest_json_path = results_dir / "latest.json"
    with open(latest_json_path, "w", encoding="utf-8") as f:
        json.dump(full_results, f, indent=2)
    print(f"\n[OK] Machine-readable results saved to {latest_json_path}")

    # Generate and save report.md
    report_md = generate_markdown_report(aggregated, run_meta)
    report_md_path = results_dir / "report.md"
    with open(report_md_path, "w", encoding="utf-8") as f:
        f.write(report_md)
    print(f"[OK] Human-readable report saved to {report_md_path}")

    # Print summary to console
    print("\n" + "=" * 70)
    print("EVALUATION BENCHMARK SUMMARY (TARGETS VS MEASURED)")
    print("=" * 70)
    for k, v in aggregated.get("targets_vs_measured", {}).items():
        status = "[PASS]" if v.get("passed") else "[FAIL]"
        print(f"  {status} {k:<35}: Target {v.get('target'):<12} | Measured: {v.get('measured')}")
    print("=" * 70)

    return full_results


def main() -> None:
    """CLI entrypoint for evaluation benchmark runner."""
    parser = argparse.ArgumentParser(description="Notice to Action - Evaluation Benchmark Runner")
    parser.add_argument(
        "--annotations-dir",
        type=Path,
        default=PROJECT_ROOT / "data" / "annotations",
        help="Path to directory containing ground-truth JSON annotations",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=PROJECT_ROOT / "evaluation" / "cache",
        help="Path to raw model output cache directory",
    )
    parser.add_argument(
        "--results-dir",
        type=Path,
        default=PROJECT_ROOT / "evaluation" / "results",
        help="Path to evaluation results output directory",
    )
    parser.add_argument(
        "--fake",
        action="store_true",
        help="Run in deterministic fake mode using canned responses for offline testing",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Bypass cache and force recomputation of all notice predictions",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of annotations to process",
    )

    args = parser.parse_args()

    results = run_evaluation(
        annotations_dir=args.annotations_dir,
        cache_dir=args.cache_dir,
        results_dir=args.results_dir,
        use_fake=args.fake,
        refresh_cache=args.refresh,
        limit=args.limit,
    )

    if not results:
        sys.exit(1)


if __name__ == "__main__":
    main()
