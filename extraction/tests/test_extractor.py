"""Unit tests for PDF extraction module."""

from pathlib import Path

import pymupdf
import pytest

from extraction.extractor import (
    ExtractionError,
    ExtractionFileNotFoundError,
    ExtractionInvalidFormatError,
    check_document_readability,
    extract_pages,
    process_pdf,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"


# Backward-compatible baseline tests
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
    """Verify process_pdf returns structured notice conforming to schema structure."""
    fake_pdf = tmp_path / "circular_2026.pdf"
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Official Notice: Circular 2026 for scholarship renewal.")
    doc.save(str(fake_pdf))
    doc.close()

    result = process_pdf(fake_pdf)
    assert isinstance(result, dict)
    assert "notice_id" in result
    assert result["schema_version"] == "1.0"
    assert "deadlines" in result
    assert "required_documents" in result
    assert "action_steps" in result
    assert "document_quality" in result
    assert result["category"] == "scholarship_or_college"


# Phase 2 extraction tests
def test_extract_pages_page_numbers_and_structure() -> None:
    """Verify extract_pages returns 1-indexed pages with text, method, and char_count."""
    fixture_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    assert fixture_path.exists(), f"Fixture missing at {fixture_path}"

    pages = extract_pages(fixture_path)
    assert len(pages) == 2

    # Validate Page 1
    p1 = pages[0]
    assert p1["page_number"] == 1
    assert p1["method"] == "text"
    assert p1["char_count"] > 100
    assert "Post-Graduate Merit Scholarship" in p1["text"]
    assert p1["status"] == "ok"

    # Validate Page 2
    p2 = pages[1]
    assert p2["page_number"] == 2
    assert p2["method"] == "text"
    assert p2["char_count"] > 100
    assert "College Verification Guidelines" in p2["text"]
    assert p2["status"] == "ok"


def test_extract_pages_scanned_unreadable_handling() -> None:
    """Verify pages with no usable text are marked as unreadable and return clearer doc status."""
    fixture_path = FIXTURES_DIR / "scanned_image_only.pdf"
    assert fixture_path.exists(), f"Fixture missing at {fixture_path}"

    pages = extract_pages(fixture_path)
    assert len(pages) == 1
    p = pages[0]
    assert p["page_number"] == 1
    assert p["method"] == "unreadable"
    assert p["char_count"] == 0
    assert p["status"] == "needs a clearer document"

    readability = check_document_readability(pages)
    assert readability["status"] == "needs a clearer document"
    assert readability["unreadable_pages"] == 1


def test_extract_pages_corrupt_file_handling() -> None:
    """Verify corrupt PDF raises friendly ExtractionError without crashing."""
    fixture_path = FIXTURES_DIR / "corrupt_file.pdf"
    assert fixture_path.exists(), f"Fixture missing at {fixture_path}"

    with pytest.raises(ExtractionError) as exc_info:
        extract_pages(fixture_path)

    assert "corrupted, damaged, or malformed" in str(exc_info.value)


def test_extract_pages_empty_file(tmp_path: Path) -> None:
    """Verify 0-byte PDF raises friendly ExtractionError."""
    empty_pdf = tmp_path / "empty.pdf"
    empty_pdf.write_bytes(b"")

    with pytest.raises(ExtractionError) as exc_info:
        extract_pages(empty_pdf)

    assert "completely empty" in str(exc_info.value)


def test_extract_pages_encrypted_file(tmp_path: Path) -> None:
    """Verify password-protected PDF raises friendly ExtractionError."""
    enc_pdf = tmp_path / "encrypted.pdf"
    doc = pymupdf.open()
    doc.new_page()
    # Save with user password
    perm = pymupdf.PDF_PERM_ACCESSIBILITY
    doc.save(
        str(enc_pdf),
        encryption=pymupdf.PDF_ENCRYPT_AES_256,
        user_pw="secret123",
        owner_pw="owner123",
        permissions=perm,
    )
    doc.close()

    with pytest.raises(ExtractionError) as exc_info:
        extract_pages(enc_pdf)

    assert "encrypted or password-protected" in str(exc_info.value)


def test_extract_pages_page_limit_enforced(tmp_path: Path) -> None:
    """Verify maximum allowable page limit is enforced."""
    multi_pdf = tmp_path / "multi_page.pdf"
    doc = pymupdf.open()
    for _ in range(5):
        doc.new_page()
    doc.save(str(multi_pdf))
    doc.close()

    with pytest.raises(ExtractionError) as exc_info:
        extract_pages(multi_pdf, max_pages=3)

    assert "exceeds the maximum limit of 3 pages" in str(exc_info.value)


def test_extract_pages_size_limit_enforced(tmp_path: Path) -> None:
    """Verify maximum file size limit in bytes is enforced."""
    dummy_pdf = tmp_path / "large.pdf"
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Text")
    doc.save(str(dummy_pdf))
    doc.close()

    with pytest.raises(ExtractionError) as exc_info:
        extract_pages(dummy_pdf, max_size_bytes=100)

    assert "exceeds the maximum permitted limit" in str(exc_info.value)


def test_extract_pages_subclasses() -> None:
    """Verify ExtractionFileNotFoundError and ExtractionInvalidFormatError are catchable."""
    with pytest.raises(ExtractionFileNotFoundError):
        extract_pages("nonexistent_path_file.pdf")

    with pytest.raises(ExtractionInvalidFormatError):
        extract_pages("not_a_pdf.docx")
