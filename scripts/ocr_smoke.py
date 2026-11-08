"""Manual smoke test script for Notice to Action OCR extraction fallback.

Usage:
    .venv\\Scripts\\python scripts/ocr_smoke.py [path/to/notice.pdf] [--mode tesseract|gemini_vision] [--full]

Examples:
    # Quick OCR check of the scanned fixture using local Tesseract
    .venv\\Scripts\\python scripts/ocr_smoke.py --mode tesseract

    # Quick OCR check using Gemini Vision (requires GEMINI_API_KEY)
    .venv\\Scripts\\python scripts/ocr_smoke.py --mode gemini_vision

    # Full end-to-end extraction pipeline with structured output
    .venv\\Scripts\\python scripts/ocr_smoke.py --mode tesseract --full
"""

import argparse
import os
import sys
import time
from pathlib import Path

# Ensure project root is available on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

from extraction.extractor import check_document_readability, extract_pages  # noqa: E402
from extraction.language import detect_document_language  # noqa: E402
from extraction.ocr import (  # noqa: E402
    check_ocr_quality,
    is_tesseract_installed,
)
from extraction.pipeline import process_notice  # noqa: E402

DEFAULT_FIXTURE_PATH = "tests/fixtures/scanned_notice_with_text.pdf"


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line argument parser."""
    parser = argparse.ArgumentParser(
        description="Manual smoke test script for Notice to Action OCR extraction."
    )
    parser.add_argument(
        "pdf_path",
        nargs="?",
        default=DEFAULT_FIXTURE_PATH,
        help=f"Path to PDF notice to inspect (default: '{DEFAULT_FIXTURE_PATH}').",
    )
    parser.add_argument(
        "--mode",
        choices=["tesseract", "gemini_vision", "off"],
        default=None,
        help="OCR mode ('tesseract' or 'gemini_vision'). Defaults to OCR_MODE env var.",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Run the complete structured pipeline and print fields (requires LLM API key).",
    )
    parser.add_argument(
        "--full-text",
        action="store_true",
        help="Print complete OCR/extracted text for each page instead of truncating to 300 characters.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run manual OCR smoke test and print diagnostic results."""
    load_dotenv()
    parser = build_parser()
    args = parser.parse_args(argv)

    # 1. Resolve OCR mode
    active_mode = (args.mode or os.getenv("OCR_MODE", "off")).lower().strip()

    if active_mode in ("off", ""):
        print(
            "\n[OCR Disabled]\n"
            "OCR mode is currently 'off'.\n"
            "To run OCR smoke testing, specify --mode tesseract or --mode gemini_vision "
            "(or set OCR_MODE in your environment or .env file).\n",
            file=sys.stderr,
        )
        return 1

    if active_mode not in ("tesseract", "gemini_vision"):
        print(
            f"\n[Invalid OCR Mode]\n"
            f"Unsupported OCR mode '{active_mode}'. Supported modes are 'tesseract' and 'gemini_vision'.\n",
            file=sys.stderr,
        )
        return 1

    # 2. Check prerequisites for the chosen mode
    if active_mode == "tesseract":
        is_avail, missing_msg = is_tesseract_installed()
        if not is_avail:
            print(
                f"\n[Tesseract Not Installed / Not Found]\n"
                f"{missing_msg}\n",
                file=sys.stderr,
            )
            return 1

    if active_mode == "gemini_vision":
        api_key = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or os.getenv("LLM_API_KEY")
        )
        if not api_key:
            print(
                "\n[Gemini API Key Required]\n"
                "Gemini Vision OCR requires an API key.\n"
                "Please configure GEMINI_API_KEY or GOOGLE_API_KEY in your environment or .env file.\n",
                file=sys.stderr,
            )
            return 1

    # 3. Check PDF file existence
    target_path = Path(args.pdf_path)
    if not target_path.exists():
        print(
            f"\n[File Not Found]\n"
            f"Target PDF does not exist at '{target_path}'.\n",
            file=sys.stderr,
        )
        return 1

    print("\n" + "=" * 70)
    print("  NOTICE TO ACTION: OCR SMOKE TEST")
    print("=" * 70)
    print(f"Target PDF:       {target_path}")
    print(f"OCR Mode:         {active_mode}")
    print(f"Mode Scope:       {'Full Pipeline (--full)' if args.full else 'Extraction Only (No LLM Calls)'}")
    print("-" * 70)

    # 4. Run real extraction path
    try:
        pages = extract_pages(target_path, ocr_mode=active_mode)
    except Exception as exc:
        print(f"\n[Extraction Failure] Could not extract document: {exc}\n", file=sys.stderr)
        return 1

    # 5. Print per-page extraction results
    print("\n--- PAGE EXTRACTION RESULTS ---")
    for page in pages:
        page_num = page.get("page_number", 1)
        method = page.get("method", "unknown")
        char_count = page.get("char_count", 0)
        raw_text = page.get("text", "") or ""

        if method in ("text", "ocr"):
            is_usable, reason = check_ocr_quality(raw_text)
            quality_str = "PASS (usable)" if is_usable else f"FAIL ({reason})"
        else:
            err = page.get("ocr_error") or "Unreadable / blank page"
            quality_str = f"FAIL ({err})"

        print(f"\nPage {page_num}:")
        print(f"  Method:          {method}")
        print(f"  Character Count: {char_count}")
        print(f"  Quality Result:  {quality_str}")
        display_str = page.get("display_text") or raw_text
        if args.full_text:
            print("  Complete Page Text:")
            if display_str.strip():
                for line in display_str.splitlines():
                    print(f"    {line}")
            else:
                print("    [No text extracted]")
        else:
            preview = display_str[:300].strip()
            if len(display_str) > 300:
                preview += "..."
            print("  Text Preview (first 300 chars):")
            if preview:
                for line in preview.splitlines():
                    print(f"    {line}")
            else:
                print("    [No text extracted]")

    # 6. Print document-level OCR summary
    ocr_used = any(p.get("method") == "ocr" for p in pages)
    lang_info = detect_document_language(pages)
    detected_language = lang_info.get("language", "en")

    ocr_warnings: list[str] = []
    if ocr_used:
        ocr_warnings.append(
            "OCR_USED (warning): This notice was read from a scan. Please check all details against your original."
        )

    readability = check_document_readability(pages)
    unreadable_pages = readability.get("unreadable_page_numbers") or []
    if unreadable_pages:
        pages_str = ", ".join(str(n) for n in sorted(unreadable_pages))
        ocr_warnings.append(
            f"PARTIAL_PAGE_UNREADABLE (warning): Page(s) {pages_str} could not be read clearly and were skipped."
        )

    if any(p.get("ocr_cap_hit") for p in pages):
        max_pages = os.getenv("OCR_GEMINI_MAX_PAGES", "5")
        ocr_warnings.append(
            f"OCR_PAGE_CAP_REACHED (warning): OCR page limit reached (max {max_pages} pages). Remaining scanned pages were skipped."
        )

    print("\n--- DOCUMENT-LEVEL OCR SUMMARY ---")
    print(f"OCR Used:          {ocr_used}")
    print(f"Detected Language: {detected_language}")
    print("OCR Warnings:")
    if ocr_warnings:
        for w in ocr_warnings:
            print(f"  - {w}")
    else:
        print("  (None)")

    # 7. Full pipeline execution if requested
    if not args.full:
        print("\n[Complete] Run with --full to execute the complete structured extraction pipeline.\n")
        return 0

    llm_api_key = (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or os.getenv("LLM_API_KEY")
    )
    if not llm_api_key:
        print(
            "\n[Notice] --full was specified, but no LLM API key is configured.\n"
            "Set GEMINI_API_KEY or GOOGLE_API_KEY in your environment to run the full pipeline.\n",
            file=sys.stderr,
        )
        return 0

    print("\n" + "=" * 70)
    print("  FULL PIPELINE EXTRACTION")
    print("=" * 70)

    start_time = time.perf_counter()
    try:
        pipeline_res = process_notice(target_path, ocr_mode=active_mode)
    except Exception as exc:
        print(f"\n[Pipeline Failure] Execution error: {exc}\n", file=sys.stderr)
        return 1
    elapsed_sec = time.perf_counter() - start_time

    status = pipeline_res.get("status", "unknown")
    category = pipeline_res.get("category", "unknown")
    needs_veri = pipeline_res.get("needs_verification", False)
    result_data = pipeline_res.get("result") or {}

    print(f"Status:            {status}")
    print(f"Category:          {category}")
    print(f"Needs Verification:{needs_veri}")
    print(f"Total Time:        {elapsed_sec:.2f}s")

    print("\nPlain-Language Summary:")
    summary = result_data.get("plain_language_summary") or {}
    if summary:
        print(f"  What is this:       {summary.get('what_is_this', 'N/A')}")
        print(f"  Why it matters:     {summary.get('why_it_matters', 'N/A')}")
        print(f"  What to do:         {summary.get('what_to_do', 'N/A')}")
        print(f"  Where to do it:     {summary.get('where_to_do_it', 'N/A')}")
        print(f"  If deadline missed: {summary.get('if_deadline_missed', 'N/A')}")
    else:
        print("  (None found)")

    print("\nDeadlines:")
    deadlines = result_data.get("deadlines") or []
    if deadlines:
        for idx, d in enumerate(deadlines, 1):
            desc = d.get("description", "No description")
            dt = d.get("date") or d.get("raw_date_string") or "uncertain"
            role = d.get("role", "primary")
            quote = d.get("evidence_quote") or "None"
            page = d.get("source_page", "Unknown")
            print(f"  {idx}. [{role.upper()}] {desc} -> {dt}")
            print(f"     Evidence Quote: \"{quote}\" (Page {page})")
    else:
        print("  (None found)")

    print("\nRequired Documents:")
    docs = result_data.get("required_documents") or []
    if docs:
        for idx, doc in enumerate(docs, 1):
            name = doc.get("name", "Unnamed document")
            is_req = "Mandatory" if doc.get("is_required", True) else "Suggested/Optional"
            quote = doc.get("evidence_quote") or "None"
            page = doc.get("source_page", "Unknown")
            print(f"  {idx}. {name} ({is_req})")
            print(f"     Evidence Quote: \"{quote}\" (Page {page})")
    else:
        print("  (None found)")

    print("\nAction Steps:")
    steps = result_data.get("action_steps") or []
    if steps:
        for s in steps:
            order = s.get("order", 1)
            action = s.get("action", "No action specified")
            quote = s.get("evidence_quote") or "None"
            page = s.get("source_page", "Unknown")
            print(f"  Step {order}: {action}")
            print(f"     Evidence Quote: \"{quote}\" (Page {page})")
    else:
        print("  (None found)")

    print("\nWarnings:")
    warnings = result_data.get("warnings") or []
    if warnings:
        for w in warnings:
            code = w.get("code", "WARNING")
            w_text = w.get("warning_text", "")
            sev = w.get("severity", "warning")
            print(f"  - [{code}] ({sev}): {w_text}")
    else:
        print("  (None)")

    print("\n" + "=" * 70 + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
