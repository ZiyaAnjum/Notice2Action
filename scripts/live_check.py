"""Live check script for Notice2Action sample extractions.

Runs full extraction on each sample notice file in `samples/` using the configured
Gemini model and prints status, category, number of deadlines, and any errors.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT / ".env")

from extraction.llm_client import GeminiLLMClient
from extraction.pipeline import process_notice
from backend.app.services.image_preprocessor import (
    create_pdf_from_images,
    enhance_image_for_ocr,
    normalize_and_strip_metadata,
)


def main() -> int:
    api_key = os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY")
    primary_model = os.getenv("LLM_MODEL", "gemini-3.5-flash")
    fallback_model = os.getenv("LLM_FALLBACK_MODEL", "gemini-3.5-flash-lite")

    print("=" * 70)
    print("Notice2Action - Live Sample Extractions Check")
    print("=" * 70)
    print(f"Project root  : {PROJECT_ROOT}")
    print(f"API Key       : {'***' + api_key[-6:] if api_key else 'NOT CONFIGURED'}")
    print(f"Primary Model : {primary_model}")
    print(f"Fallback Model: {fallback_model}")
    print("=" * 70)

    if not api_key:
        print("ERROR: LLM_API_KEY is not set in .env. Please configure it first.")
        return 1

    client = GeminiLLMClient(
        api_key=api_key,
        model=primary_model,
        fallback_model=fallback_model,
        timeout_seconds=45.0,
    )

    samples_dir = PROJECT_ROOT / "samples"
    sample_files = sorted(
        [f for f in samples_dir.iterdir() if f.suffix.lower() in (".pdf", ".jpg", ".jpeg", ".png")]
    )

    if not sample_files:
        print(f"No PDF or image samples found in {samples_dir}.")
        return 1

    overall_results: list[dict[str, str | int]] = []

    scratch_dir = PROJECT_ROOT / "scratch"
    scratch_dir.mkdir(parents=True, exist_ok=True)

    for idx, sample_file in enumerate(sample_files, start=1):
        print(f"\n[{idx}/{len(sample_files)}] Checking: {sample_file.name}")
        print("-" * 50)

        # If it's a photo, simulate the camera upload pipeline (pre-process to PDF)
        target_path = sample_file
        if sample_file.suffix.lower() in (".jpg", ".jpeg", ".png"):
            print("  [Pre-processing] Photo detected -> Normalizing and compiling to PDF...")
            try:
                raw_bytes = sample_file.read_bytes()
                clean_img, sharpness = normalize_and_strip_metadata(raw_bytes)
                enhanced_img = enhance_image_for_ocr(clean_img)
                pdf_bytes = create_pdf_from_images([enhanced_img])
                target_path = scratch_dir / f"live_check_{sample_file.stem}.pdf"
                target_path.write_bytes(pdf_bytes)
                print(f"  [Pre-processing] Sharpness: {sharpness:.1f} | PDF created: {target_path.name}")
            except Exception as prep_err:
                print(f"  [Pre-processing Error] Failed to prepare photo: {prep_err}")
                overall_results.append({
                    "file": sample_file.name,
                    "status": "preprocessing_failed",
                    "category": "N/A",
                    "deadlines": 0,
                    "error": str(prep_err),
                })
                continue

        t0 = time.perf_counter()
        try:
            res = process_notice(
                target_path,
                client=client,
                allow_vision_fallback=True,
            )
            duration = time.perf_counter() - t0

            status = res.get("status", "unknown")
            category = res.get("category", "unknown")
            result_data = res.get("result") or {}
            deadlines = result_data.get("deadlines", [])
            action_steps = result_data.get("action_steps", [])
            headline = result_data.get("headline") or {}
            title = headline.get("one_line_summary") or headline.get("title") or "N/A"
            issuer = headline.get("source_organisation") or "N/A"
            amount_due = headline.get("amount_due") or "N/A"
            error_msg = res.get("message") if status != "success" else None

            print(f"  Status        : {status}")
            print(f"  Category      : {category}")
            print(f"  Deadlines     : {len(deadlines)}")
            print(f"  Action Steps  : {len(action_steps)}")
            print(f"  Issuer        : {issuer}")
            print(f"  Amount Due    : {amount_due}")
            print(f"  Title/Summary : {title[:100]}...")
            print(f"  Duration      : {duration:.2f}s")
            if error_msg:
                print(f"  Error Detail  : {error_msg}")

            overall_results.append({
                "file": sample_file.name,
                "status": status,
                "category": category,
                "deadlines": len(deadlines),
                "error": error_msg or "",
            })
        except Exception as exc:
            duration = time.perf_counter() - t0
            print(f"  FAILED with exception in {duration:.2f}s: {exc}")
            overall_results.append({
                "file": sample_file.name,
                "status": "exception",
                "category": "unknown",
                "deadlines": 0,
                "error": str(exc),
            })

    # Summary Table
    print("\n" + "=" * 70)
    print("SUMMARY REPORT")
    print("=" * 70)
    header = f"{'File':<36} | {'Status':<12} | {'Category':<22} | {'Deadlines':<9} | {'Error'}"
    print(header)
    print("-" * len(header))
    all_succeeded = True
    for r in overall_results:
        err_str = (r["error"][:30] + "...") if len(str(r["error"])) > 30 else str(r["error"])
        print(f"{r['file']:<36} | {r['status']:<12} | {r['category']:<22} | {r['deadlines']:<9} | {err_str}")
        if r["status"] != "success":
            all_succeeded = False

    print("=" * 70)
    return 0 if all_succeeded else 1


if __name__ == "__main__":
    sys.exit(main())
