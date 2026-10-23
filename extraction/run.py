"""CLI runner for Notice to Action PDF extraction and classification.

Usage:
    python -m extraction.run path/to/file.pdf
"""

import argparse
import sys
from pathlib import Path

from extraction.classifier import classify_notice
from extraction.extractor import ExtractionError, check_document_readability, extract_pages


def main() -> int:
    """Parse CLI arguments, extract PDF content, and print classification summary."""
    parser = argparse.ArgumentParser(
        prog="python -m extraction.run",
        description="Extract text per page and classify official notice PDFs.",
    )
    parser.add_argument(
        "file_path",
        type=str,
        help="Path to the PDF notice file to process.",
    )

    args = parser.parse_args()
    pdf_path = Path(args.file_path)

    try:
        pages = extract_pages(pdf_path)
    except ExtractionError as err:
        print(f"\n[Extraction Error] {err.message}\n", file=sys.stderr)
        return 1
    except Exception as err:
        print(
            f"\n[Unexpected Error] An error occurred while opening the document: {err}\n",
            file=sys.stderr,
        )
        return 1

    readability = check_document_readability(pages)
    classification = classify_notice(pages)

    print("=" * 60)
    print(f"File: {pdf_path.name}")
    print(f"Total Pages: {len(pages)}")
    print(f"Document Readability: {readability['status']}")
    print("-" * 60)
    print("Page Breakdown:")
    for page in pages:
        p_num = page["page_number"]
        method = page["method"]
        chars = page["char_count"]
        status = page.get("status", "ok")
        print(f"  Page {p_num}: method={method} | characters={chars} | status={status}")

    print("-" * 60)
    print("Notice Classification:")
    print(f"  Category:        {classification['category']}")
    print(f"  Confidence:      {classification['confidence']:.2f}")
    matched = (
        ", ".join(classification["matched_signals"])
        if classification["matched_signals"]
        else "none"
    )
    print(f"  Matched Signals: {matched}")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
