#!/usr/bin/env python3
"""Generate an empty annotation stub and readable page text dump for a PDF notice.

Usage:
    python scripts/make_annotation_stub.py tests/fixtures/tax_or_payment.pdf
    python scripts/make_annotation_stub.py path/to/notice.pdf --output-dir data/annotations
"""

import argparse
import json
import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from extraction.extractor import extract_pages  # noqa: E402


def make_annotation_stub(
    pdf_path: str | Path,
    output_dir: str | Path = "data/annotations",
) -> tuple[Path, Path]:
    """Create an empty ground-truth annotation template and page text dump.

    Does NOT run the model, ensuring annotations are created purely from source
    to prevent confirmation bias.

    Args:
        pdf_path: Path to target PDF file.
        output_dir: Target directory for stub and dump files.

    Returns:
        (stub_json_path, text_dump_path)
    """
    pdf = Path(pdf_path).resolve()
    if not pdf.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf}")

    out_dir = Path(output_dir)
    if not out_dir.is_absolute():
        out_dir = PROJECT_ROOT / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    notice_id = pdf.stem
    stub_file = out_dir / f"{notice_id}.json"
    dump_file = out_dir / f"{notice_id}_pages_dump.txt"

    # 1. Extract pages for human inspection dump
    pages = extract_pages(pdf)

    # 2. Write empty template
    # Relative path if within project root, else string of path
    try:
        rel_pdf = str(pdf.relative_to(PROJECT_ROOT)).replace("\\", "/")
    except ValueError:
        rel_pdf = str(pdf).replace("\\", "/")

    stub_data = {
    "notice_id": notice_id,
    "source_pdf": rel_pdf,
    "expected_category": "TODO: tax_or_payment | bank | utility | scholarship_or_college | government_scheme | other_out_of_scope",
    "expected_status": "processed",
    "explicit_deadlines": [],
    "required_documents": [],
    "action_steps": [],
    "submission_channel": None,
    "penalties": [],
    "ambiguous_or_missing_notes": None,
    "critical_evidence_passages": [],
}

    with open(stub_file, "w", encoding="utf-8") as f:
        json.dump(stub_data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # 3. Write text dump
    with open(dump_file, "w", encoding="utf-8") as f:
        f.write(f"=== SOURCE PDF: {pdf.name} ===\n")
        f.write(f"=== TOTAL EXTRACTED PAGES: {len(pages)} ===\n\n")
        for page in pages:
            p_num = page.get("page_number", 1)
            char_count = page.get("char_count", 0)
            method = page.get("method", "text")
            status = page.get("status", "ok")
            text = page.get("text", "")

            f.write(f"--- [PAGE {p_num}] (chars: {char_count}, method: {method}, status: {status}) ---\n")
            f.write(text.strip())
            f.write("\n\n")

    return stub_file, dump_file


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate an empty annotation stub and page text dump for a notice PDF."
    )
    parser.add_argument("pdf_path", help="Path to notice PDF file")
    parser.add_argument(
        "--output-dir",
        "-o",
        default="data/annotations",
        help="Directory to save the annotation stub and text dump (default: data/annotations)",
    )

    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    try:
        stub_path, dump_path = make_annotation_stub(args.pdf_path, args.output_dir)
        print(f"Created empty annotation template: {stub_path}")
        print(f"Created page text dump:           {dump_path}")
        print("\nNext step: read the text dump and fill in ground-truth values in the JSON template.")
    except Exception as err:
        print(f"Error: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
