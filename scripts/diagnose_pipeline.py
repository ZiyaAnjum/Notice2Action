"""Diagnose Notice to Action pipeline performance and failure points across all sample notices."""

import logging
import os
import sys
import time
from pathlib import Path

# Setup logging to show TIMING logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from extraction.pipeline import process_notice

SAMPLE_NOTICES = [
    PROJECT_ROOT / "data" / "masked" / "sample_electricity_notice.pdf",
    PROJECT_ROOT / "data" / "masked" / "sample_bank_kyc_notice.pdf",
    PROJECT_ROOT / "data" / "masked" / "sample_scholarship_renewal.pdf",
    PROJECT_ROOT / "tests" / "fixtures" / "utility.pdf",
    PROJECT_ROOT / "tests" / "fixtures" / "bank.pdf",
    PROJECT_ROOT / "tests" / "fixtures" / "scholarship_or_college.pdf",
    PROJECT_ROOT / "tests" / "fixtures" / "tax_or_payment.pdf",
    PROJECT_ROOT / "tests" / "fixtures" / "government_scheme.pdf",
    PROJECT_ROOT / "tests" / "fixtures" / "scanned_image_only.pdf",
]


def run_diagnostics():
    results = []

    print("\n" + "=" * 105)
    print("                    NOTICE TO ACTION: STEP 0 DIAGNOSTIC RUN")
    print("=" * 105)

    for pdf_path in SAMPLE_NOTICES:
        if not pdf_path.exists():
            print(f"Skipping missing sample: {pdf_path}")
            continue

        print(f"\n---> Processing: {pdf_path.name} ({pdf_path.stat().st_size} bytes)")
        t0 = time.perf_counter()
        try:
            res = process_notice(pdf_path)
            total_dur = time.perf_counter() - t0
        except Exception as exc:
            total_dur = time.perf_counter() - t0
            res = {
                "status": "crashed",
                "message": f"Exception: {type(exc).__name__}: {exc}",
                "stage_timings": {},
            }

        status = res.get("status", "unknown")
        stage_timings = res.get("stage_timings", {})
        message = res.get("message", "")
        category = res.get("category", "unknown")

        # Failure classification
        failure_type = "None (Success)"
        if status != "success":
            msg_lower = (message or "").lower()
            if "timeout" in msg_lower or "timed out" in msg_lower or "budget" in msg_lower:
                failure_type = "Timeout"
            elif "404" in msg_lower or "not found" in msg_lower and "model" in msg_lower:
                failure_type = "404 / Missing Model"
            elif "quota" in msg_lower or "429" in msg_lower or "busy" in msg_lower:
                failure_type = "Quota / Rate Limit (429)"
            elif "syntax" in msg_lower or "decode" in msg_lower or "invalid json" in msg_lower:
                failure_type = "Invalid JSON"
            elif "schema" in msg_lower or "validation" in msg_lower:
                failure_type = "Validator Rejection"
            elif "unreadable" in msg_lower or "empty" in msg_lower or "clearer" in msg_lower:
                failure_type = "Empty / Unreadable Text"
            elif "network" in msg_lower or "getaddrinfo" in msg_lower:
                failure_type = "Network / Sandbox Blocked"
            elif status == "out_of_scope":
                failure_type = "Classified Out of Scope"
            else:
                failure_type = f"Extraction Failed ({status})"

        results.append({
            "filename": pdf_path.name,
            "file_size": pdf_path.stat().st_size,
            "status": status,
            "failure_type": failure_type,
            "category": category,
            "total_dur": total_dur,
            "timings": stage_timings,
            "message": message[:80],
        })

    # Print summary table
    print("\n" + "=" * 125)
    print("                                      DIAGNOSTIC SUMMARY TABLE")
    print("=" * 125)
    header = f"{'Sample Notice':<32} | {'Status':<16} | {'Failure Reason':<26} | {'Total(s)':<8} | {'PDF(s)':<7} | {'OCR(s)':<7} | {'LLM(s)':<8}"
    print(header)
    print("-" * 125)

    for r in results:
        t = r["timings"]
        pdf_t = t.get("pdf_text_extraction", {}).get("duration_sec", 0.0)
        ocr_t = t.get("ocr", {}).get("duration_sec", 0.0)
        llm_t = t.get("llm_call", {}).get("duration_sec", 0.0)
        line = f"{r['filename']:<32} | {r['status']:<16} | {r['failure_type']:<26} | {r['total_dur']:<8.3f} | {pdf_t:<7.3f} | {ocr_t:<7.3f} | {llm_t:<8.3f}"
        print(line)

    print("=" * 125)

    # Detailed stage breakdown
    print("\nSTAGE-BY-STAGE DETAIL:")
    for r in results:
        print(f"\n--- {r['filename']} ---")
        print(f"  Status: {r['status']} | Failure: {r['failure_type']}")
        print(f"  Message: {r['message']}")
        t = r["timings"]
        for stage, data in t.items():
            print(f"    - {stage:<20}: dur={data.get('duration_sec', 0):.4f}s, in={data.get('input_size', 0)}, out={data.get('output_size', 0)}")


if __name__ == "__main__":
    run_diagnostics()

