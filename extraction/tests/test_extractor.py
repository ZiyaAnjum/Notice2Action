from pathlib import Path
import pytest
from extraction.extractor import process_pdf


def test_process_pdf_file_not_found() -> None:
    """Verify process_pdf raises FileNotFoundError on missing file."""
    with pytest.raises(FileNotFoundError):
        process_pdf("non_existent_file.pdf")


def test_process_pdf_invalid_extension(tmp_path: Path) -> None:
    """Verify process_pdf raises ValueError when file is not a PDF."""
    txt_file = tmp_path / "notice.txt"
    txt_file.write_text("sample content")
    with pytest.raises(ValueError):
        process_pdf(txt_file)


def test_process_pdf_returns_schema_valid_stub(tmp_path: Path) -> None:
    """Verify process_pdf returns mock notice conforming to schema structure."""
    fake_pdf = tmp_path / "circular_2026.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4 test")

    result = process_pdf(fake_pdf)
    assert isinstance(result, dict)
    assert "notice_id" in result
    assert result["schema_version"] == "1.0"
    assert "deadlines" in result
    assert "required_documents" in result
    assert "action_steps" in result
    assert "document_quality" in result
