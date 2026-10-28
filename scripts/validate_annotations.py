#!/usr/bin/env python3
"""Validate ground-truth annotation files against JSON schema and PDF source text.

Ensures:
1. Every annotation conforms to schemas/annotation.schema.json.
2. Every quote in critical_evidence_passages actually appears verbatim
   (whitespace-normalized) on its declared 1-indexed page in the source PDF.

Usage:
    python scripts/validate_annotations.py
    python scripts/validate_annotations.py data/annotations/tax_or_payment.json
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import jsonschema

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from extraction.extractor import extract_pages  # noqa: E402
from validation.validator import normalize_text  # noqa: E402

SCHEMA_PATH = PROJECT_ROOT / "schemas" / "annotation.schema.json"


def load_annotation_schema() -> dict[str, Any]:
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def validate_single_annotation(
    annotation_path: Path,
    schema: dict[str, Any],
) -> list[str]:
    """Validate one annotation file against schema and source PDF quotes."""
    errors: list[str] = []

    # 1. Load JSON
    try:
        with open(annotation_path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as err:
        return [f"Failed to parse JSON in '{annotation_path.name}': {err}"]

    # 2. Validate JSON Schema
    validator = jsonschema.Draft202012Validator(schema)
    for err in sorted(validator.iter_errors(data), key=lambda e: e.path):
        loc = ".".join(str(p) for p in err.path) or "root"
        errors.append(f"Schema error at '{loc}': {err.message}")

    # If schema failed at top level, return early
    if errors:
        return errors

    # 3. Check source PDF existence
    source_pdf_raw = data.get("source_pdf")
    if not source_pdf_raw:
        return ["Missing 'source_pdf' path."]

    pdf_path = Path(source_pdf_raw)
    if not pdf_path.is_absolute():
        pdf_path = PROJECT_ROOT / pdf_path

    if not pdf_path.exists():
        errors.append(f"Referenced source_pdf does not exist: {pdf_path}")
        return errors

    # 4. Extract pages and verify critical evidence quotes
    passages = data.get("critical_evidence_passages", [])
    expected_status = data.get("expected_status")

    # If the document is expected to be unreadable or scanned-only, passages might be empty
    if expected_status == "needs_clearer_document" and not passages:
        return errors

    try:
        pages = extract_pages(pdf_path)
    except Exception as err:
        errors.append(f"Failed to extract pages from source PDF '{pdf_path.name}': {err}")
        return errors

    total_pages = len(pages)
    normalized_pages = [normalize_text(p.get("text", "")) for p in pages]

    for idx, passage in enumerate(passages):
        field = passage.get("field", f"passage_{idx}")
        page_num = passage.get("page")
        quote = passage.get("quote", "")

        if not isinstance(page_num, int) or page_num < 1 or page_num > total_pages:
            errors.append(
                f"Passage for field '{field}' references invalid page {page_num} "
                f"(PDF has {total_pages} page(s))."
            )
            continue

        norm_quote = normalize_text(quote)
        if not norm_quote:
            errors.append(f"Passage for field '{field}' has empty quote.")
            continue

        page_text = normalized_pages[page_num - 1]
        if norm_quote not in page_text:
            snippet = quote[:60] + "..." if len(quote) > 60 else quote
            errors.append(
                f"Evidence quote for '{field}' not found on page {page_num}: '{snippet}'"
            )

    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate ground truth annotations.")
    parser.add_argument(
        "paths",
        nargs="*",
        default=["data/annotations"],
        help="Annotation JSON files or directories (default: data/annotations)",
    )

    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    schema = load_annotation_schema()

    files_to_check: list[Path] = []
    for p_str in args.paths:
        p = Path(p_str)
        if not p.is_absolute():
            p = PROJECT_ROOT / p

        if p.is_file() and p.suffix.lower() == ".json":
            files_to_check.append(p)
        elif p.is_dir():
            files_to_check.extend(sorted(p.glob("*.json")))

    if not files_to_check:
        print("No annotation JSON files found to validate.")
        sys.exit(0)

    total_files = len(files_to_check)
    passed_count = 0
    all_errors: dict[str, list[str]] = {}

    print(f"Validating {total_files} annotation file(s) against schema and PDF text...\n")

    for file_path in files_to_check:
        errs = validate_single_annotation(file_path, schema)
        if errs:
            all_errors[file_path.name] = errs
            print(f"  [FAIL] {file_path.name}: {len(errs)} error(s)")
            for e in errs:
                print(f"      - {e}")
        else:
            passed_count += 1
            print(f"  [OK]   {file_path.name}: Valid")

    print("\n" + "=" * 50)
    print(f"Annotation Validation Summary: {passed_count}/{total_files} passed.")

    if all_errors:
        print(f"Validation FAILED with errors in {len(all_errors)} file(s).")
        sys.exit(1)
    else:
        print("All annotations are valid and verified against source PDFs.")
        sys.exit(0)


if __name__ == "__main__":
    main()
