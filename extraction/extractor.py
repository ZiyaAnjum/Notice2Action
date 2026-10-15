import json
from pathlib import Path
from typing import Any, Dict, Union


def process_pdf(file_path: Union[str, Path]) -> Dict[str, Any]:
    """Stub extractor parsing PDF notice and extracting schema-compliant action plan.

    Args:
        file_path: Path to the target PDF notice file.

    Returns:
        Structured dictionary strictly conforming to schema/notice.schema.json v1.0.

    Raises:
        FileNotFoundError: If the provided file_path does not exist.
        ValueError: If the file does not have a .pdf extension.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Notice file not found at: {file_path}")

    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a PDF file, got: {path.name}")

    # Load canonical sample notice contract
    repo_root = Path(__file__).resolve().parent.parent
    sample_file = repo_root / "schema" / "sample_notice.json"

    if sample_file.exists():
        with open(sample_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Update notice metadata based on input file name
            data["notice_id"] = f"notice-{path.stem}"
            return data

    # Fallback stub dictionary
    return {
        "notice_id": f"notice-{path.stem}",
        "schema_version": "1.0",
        "category": "scholarship",
        "category_confidence": 0.95,
        "title": {
            "value": f"Extracted Notice: {path.stem}",
            "evidence": {"page": 1, "quote": f"{path.stem} Official Notification"},
            "status": "found",
        },
        "issuer": {
            "value": "Official Issuing Authority",
            "evidence": {"page": 1, "quote": "Issuing Authority Heading"},
            "status": "found",
        },
        "summary_plain": {
            "value": "Stub extraction summary placeholder for testing.",
            "evidence": {"page": 1, "quote": "Notification summary clause"},
            "status": "found",
        },
        "affected_party": {
            "value": "Concerned Citizens / Students",
            "evidence": {"page": 1, "quote": "Applicable candidates"},
            "status": "found",
        },
        "deadlines": [],
        "required_documents": [],
        "action_steps": [],
        "submission_channel": {
            "value": None,
            "evidence": {"page": None, "quote": None},
            "status": "not_found",
        },
        "fees_penalties": [],
        "warnings": [],
        "document_quality": "good",
        "page_count": 1,
        "extracted_at": "2026-10-15T00:00:00Z",
    }
