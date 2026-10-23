"""Manual smoke test script for Notice to Action live LLM extraction.

Usage:
    python scripts/smoke_llm.py path/to/notice.pdf

Note: This script is for manual smoke testing only and is not executed during pytest.
It requires LLM_API_KEY (or GEMINI_API_KEY) to be set in your environment or .env.
"""

import os
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from extraction.pipeline import process_notice  # noqa: E402


def main() -> int:
    """Run live end-to-end extraction against a real PDF and print a readable report."""
    if len(sys.argv) < 2:
        print("\nUsage: python scripts/smoke_llm.py path/to/notice.pdf\n", file=sys.stderr)
        return 1

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"\n[Error] File not found: '{pdf_path}'\n", file=sys.stderr)
        return 1

    api_key = os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY")
    provider = os.getenv("LLM_PROVIDER", "gemini")
    model = os.getenv("LLM_MODEL", "gemini-1.5-flash")

    print("\n" + "=" * 70)
    print("  NOTICE TO ACTION: LIVE LLM EXTRACTION SMOKE TEST")
    print("=" * 70)
    print(f"Target PDF:       {pdf_path.name}")
    print(f"Provider:         {provider}")
    print(f"Model:            {model}")
    print(f"API Key Present:  {'Yes' if bool(api_key) else 'NO (Missing)'}")
    print("-" * 70)

    if not api_key:
        print(
            "\n[Notice to Action Smoke Test]\n"
            "ERROR: Neither LLM_API_KEY nor GEMINI_API_KEY is configured in your environment.\n\n"
            "To run live inference with Gemini:\n"
            '  - In PowerShell:  $env:LLM_API_KEY="your_gemini_api_key"\n'
            '  - In Bash/Linux:  export LLM_API_KEY="your_gemini_api_key"\n'
            "  - Or add LLM_API_KEY=your_key to your local .env file.\n",
            file=sys.stderr,
        )
        return 1

    print("Running end-to-end pipeline (extract -> classify -> LLM -> validate -> post-process)...")
    res = process_notice(pdf_path)

    status = res["status"]
    category = res["category"]
    needs_veri = res["needs_verification"]
    data = res.get("result")

    print("\n" + "=" * 70)
    print(f"PIPELINE STATUS:        {status.upper()}")
    print(f"DETECTED CATEGORY:      {category}")
    print(f"NEEDS VERIFICATION:     {needs_veri}")
    print(f"MESSAGE:                {res.get('message', '')}")
    print("=" * 70)

    if status == "success" and isinstance(data, dict):
        print("\n--- 1. IDENTIFIERS & PARTIES ---")
        print(f"Title:        {data.get('notice_title', {}).get('text')}")
        print(f"Issuer:       {data.get('issuing_organisation', {}).get('text')}")
        print(f"Affected:     {data.get('affected_party', {}).get('text')}")
        print(f"Main Purpose: {data.get('main_purpose', {}).get('text')}")

        print("\n--- 2. PLAIN LANGUAGE SUMMARY ---")
        summary = data.get("plain_language_summary") or {}
        print(f"What is this:       {summary.get('what_is_this')}")
        print(f"Why it matters:     {summary.get('why_it_matters')}")
        print(f"What to do:         {summary.get('what_to_do')}")
        print(f"Where to do it:     {summary.get('where_to_do_it')}")
        print(f"If deadline missed: {summary.get('if_deadline_missed')}")

        print("\n--- 3. DEADLINES ---")
        deadlines = data.get("deadlines") or []
        if not deadlines:
            print("  (No deadlines extracted)")
        for idx, dl in enumerate(deadlines, 1):
            amb = " [AMBIGUOUS]" if dl.get("is_ambiguous_or_conflicting") else ""
            print(f"  [{idx}] Date: {dl.get('date')} | Page: {dl.get('source_page')}{amb}")
            print(f"      Description: {dl.get('description')}")
            print(f'      Quote: "{dl.get("evidence_quote")}"')
            if dl.get("ambiguity_reason"):
                print(f"      Ambiguity Reason: {dl.get('ambiguity_reason')}")

        print("\n--- 4. REQUIRED DOCUMENTS ---")
        docs = data.get("required_documents") or []
        if not docs:
            print("  (No documents listed)")
        for idx, doc in enumerate(docs, 1):
            req = "Mandatory" if doc.get("is_required") else "Optional"
            print(f"  [{idx}] {doc.get('name')} ({req}) | Page: {doc.get('source_page')}")
            print(f'      Quote: "{doc.get("evidence_quote")}"')

        print("\n--- 5. ACTION STEPS ---")
        steps = data.get("action_steps") or []
        if not steps:
            print("  (No action steps listed)")
        for step in steps:
            print(
                f"  Step {step.get('order')}: {step.get('action')} (Page {step.get('source_page')})"
            )

        print("\n--- 6. SUBMISSION CHANNEL & PENALTIES ---")
        sub = data.get("submission_channel") or {}
        print(f"Channel: {sub.get('channel')} (Page {sub.get('source_page')})")
        penalties = data.get("penalties") or []
        for p in penalties:
            print(f"Penalty: {p.get('description')} | Amount: {p.get('amount')}")

        print("\n--- 7. WARNINGS & CITATIONS ---")
        warnings = data.get("warnings") or []
        if not warnings:
            print("  (No warnings generated - fully grounded)")
        for w in warnings:
            print(f"  * [{w.get('severity', 'warning').upper()}] {w.get('warning_text')}")

    print("\n" + "=" * 70 + "\n")
    return 0 if status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
