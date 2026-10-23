"""CLI runner for end-to-end notice processing.

Usage:
    python -m extraction.process path/to/file.pdf [--out result.json]
"""

import argparse
import json
import sys
from pathlib import Path

from extraction.pipeline import process_notice


def main() -> int:
    """Parse CLI arguments, execute end-to-end processing pipeline, and format output."""
    parser = argparse.ArgumentParser(
        prog="python -m extraction.process",
        description="End-to-end notice processing: extraction, classification, LLM parsing, and grounding.",
    )
    parser.add_argument(
        "file_path",
        type=str,
        help="Path to the PDF notice file to process.",
    )
    parser.add_argument(
        "--out",
        type=str,
        default=None,
        help="Optional destination path to write the extracted JSON output.",
    )

    args = parser.parse_args()
    pdf_path = Path(args.file_path)

    if not pdf_path.exists():
        print(f"\n[Error] Notice file not found: '{args.file_path}'\n", file=sys.stderr)
        return 1

    print(f"\nProcessing notice: {pdf_path.name} ...")
    pipeline_result = process_notice(pdf_path)

    status = pipeline_result["status"]
    category = pipeline_result["category"]
    needs_veri = pipeline_result["needs_verification"]
    result_data = pipeline_result.get("result")
    message = pipeline_result.get("message", "")

    print("=" * 65)
    print(f"File:                 {pdf_path.name}")
    print(f"Status:               {status.upper()}")
    print(f"Category:             {category}")
    print(f"Needs Verification:   {needs_veri}")
    print(f"Message:              {message}")
    print("-" * 65)

    if status == "success" and isinstance(result_data, dict):
        title = result_data.get("notice_title", {}).get("text", "N/A")
        issuer = result_data.get("issuing_organisation", {}).get("text", "N/A")
        deadlines = result_data.get("deadlines") or []
        docs = result_data.get("required_documents") or []
        warnings = result_data.get("warnings") or []

        print(f"Notice Title:         {title}")
        print(f"Issuing Authority:    {issuer}")
        print(f"Deadlines Detected:   {len(deadlines)}")
        for dl in deadlines:
            d_date = dl.get("date", "N/A")
            d_desc = dl.get("description", "N/A")
            d_amb = " [AMBIGUOUS]" if dl.get("is_ambiguous_or_conflicting") else ""
            print(f"  - {d_date}: {d_desc}{d_amb}")

        print(f"Required Documents:   {len(docs)}")
        for doc in docs:
            d_name = doc.get("name", "N/A")
            req_tag = "[Mandatory]" if doc.get("is_required") else "[Optional]"
            print(f"  - {req_tag} {d_name}")

        if warnings:
            print(f"Warnings / Cautions:  {len(warnings)}")
            for w in warnings:
                print(f"  * {w.get('warning_text')}")

    print("=" * 65)

    # Write output JSON file if requested
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        export_payload = result_data if result_data else pipeline_result
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(export_payload, f, indent=2)
        print(f"\nWrote structured result to: {out_path.resolve()}\n")

    return 0 if status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
