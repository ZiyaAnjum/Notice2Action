import json
import uuid
from pathlib import Path
from typing import Any, Dict, Optional


class NoticeService:
    """Service layer coordinating notice storage, extraction stubs, and validation."""

    def __init__(self) -> None:
        # Locate sample mock JSON from schema directory
        self.base_dir = Path(__file__).resolve().parent.parent.parent.parent
        self.sample_path = self.base_dir / "schema" / "sample_notice.json"
        self._in_memory_store: Dict[str, Dict[str, Any]] = {}

    def get_sample_notice(self) -> Dict[str, Any]:
        """Load and return the canonical sample notice contract."""
        if self.sample_path.exists():
            with open(self.sample_path, "r", encoding="utf-8") as f:
                return json.load(f)

        # Fallback inline stub matching schema v1.0
        return {
            "notice_id": "notice-stub-001",
            "schema_version": "1.0",
            "category": "scholarship",
            "category_confidence": 0.95,
            "title": {
                "value": "Sample Placeholder Notice",
                "evidence": {"page": 1, "quote": "Placeholder Notice Heading"},
                "status": "found",
            },
            "issuer": {
                "value": "Department of Education",
                "evidence": {"page": 1, "quote": "Department of Education"},
                "status": "found",
            },
            "summary_plain": {
                "value": "Placeholder summary for testing API responses.",
                "evidence": {"page": 1, "quote": "Placeholder summary"},
                "status": "found",
            },
            "affected_party": {
                "value": "Students",
                "evidence": {"page": 1, "quote": "All students"},
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

    async def process_uploaded_file(self, filename: str, contents: bytes) -> Dict[str, Any]:
        """Stub processing for uploaded PDF notice.

        In production, this delegates to extraction.process_pdf and validation.validate_notice.
        """
        notice = self.get_sample_notice()
        # Assign fresh ID and preserve original mock contract
        new_id = f"notice-{uuid.uuid4().hex[:8]}"
        notice["notice_id"] = new_id
        self._in_memory_store[new_id] = notice
        return notice

    def get_notice_by_id(self, notice_id: str) -> Optional[Dict[str, Any]]:
        """Fetch notice by ID from memory store or return sample notice if ID matches sample."""
        if notice_id in self._in_memory_store:
            return self._in_memory_store[notice_id]
        sample = self.get_sample_notice()
        if sample.get("notice_id") == notice_id:
            return sample
        return None
