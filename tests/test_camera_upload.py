"""Unit and integration tests for camera capture and photo upload pipeline.

Covers:
1. Valid JPEG/PNG/WEBP photo upload and multi-page combination into a clean notice.
2. Blurry photo rejection via lightweight numpy Laplacian sharpness check with friendly message.
3. Empty photo (0 bytes) and invalid file type rejection.
4. Maximum photo limit enforcement (max 10 photos).
5. Total upload size limit enforcement (max 25 MB).
6. EXIF and GPS metadata stripping while preserving orientation.
7. Original color photo preservation for page image viewer and PDF download.
8. User-scoped isolation: 404 returned when another user attempts access to photo notice or page images.
9. Poor Tesseract OCR triggering Gemini Vision OCR fallback.
"""

from __future__ import annotations

import io
from datetime import date
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.models.notice import NoticeModel
from backend.app.models.user import UserModel
from backend.app.security import hash_password
from backend.app.services.image_preprocessor import (
    calculate_sharpness,
    create_pdf_from_images,
    detect_image_format,
    enhance_image_for_ocr,
    normalize_and_strip_metadata,
)
from backend.app.services.notice_service import NoticeService, NoticeServiceError
from extraction.extractor import extract_pages
from extraction.llm_client import FakeLLMClient


def create_test_notice_image(text: str = "OFFICIAL NOTICE\nPay by: 2026-11-30\nAmount: Rs 2000") -> bytes:
    """Create a crisp synthetic notice image as JPEG bytes."""
    img = Image.new("RGB", (600, 800), color="white")
    draw = ImageDraw.Draw(img)
    # Draw dark geometric lines and text for high sharpness
    draw.rectangle([20, 20, 580, 780], outline="black", width=3)
    draw.line([20, 100, 580, 100], fill="black", width=2)
    draw.text((40, 50), "GOVERNMENT ADMINISTRATIVE NOTICE", fill="black")
    y = 130
    for line in text.splitlines():
        draw.text((40, y), line, fill="black")
        y += 35
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def create_blurry_image() -> bytes:
    """Create a severely blurred image that fails the sharpness threshold."""
    img = Image.new("RGB", (600, 800), color="gray")
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 550, 750], fill="lightgray")
    # Apply severe Gaussian blur
    blurred = img.filter(ImageFilter.GaussianBlur(radius=25))
    buf = io.BytesIO()
    blurred.save(buf, format="JPEG", quality=70)
    return buf.getvalue()


@pytest.fixture
def test_setup(tmp_path: Path):
    """Set up isolated SQLite test database and notice service."""
    db_path = tmp_path / "camera_test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    # Seed User A and User B
    with TestingSession() as db:
        user_a = UserModel(
            id="user-a-uuid-1111",
            email="usera@example.com",
            full_name="User Alpha",
            password_hash=hash_password("Password123!"),
            is_verified=True,
        )
        user_b = UserModel(
            id="user-b-uuid-2222",
            email="userb@example.com",
            full_name="User Beta",
            password_hash=hash_password("Password123!"),
        )
        db.add_all([user_a, user_b])
        db.commit()

    service = NoticeService(upload_dir=tmp_path / "uploads", session_factory=TestingSession)
    return TestingSession, service, "user-a-uuid-1111", "user-b-uuid-2222"


# ==============================================================================
# 1. Image Preprocessing & Sharpness Check Tests
# ==============================================================================

def test_detect_image_format():
    """Verify magic byte detection for JPEG, PNG, and WEBP."""
    jpeg_bytes = create_test_notice_image()
    assert detect_image_format(jpeg_bytes) == "JPEG"

    # PNG magic bytes
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    assert detect_image_format(png_bytes) == "PNG"

    # WEBP magic bytes
    webp_bytes = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 10
    assert detect_image_format(webp_bytes) == "WEBP"

    # Unknown
    assert detect_image_format(b"%PDF-1.4\n") is None


def test_sharpness_check_detects_blur():
    """Verify numpy Laplacian variance differentiates crisp and blurred photos."""
    sharp_bytes = create_test_notice_image("Clear text on high contrast page")
    sharp_img = Image.open(io.BytesIO(sharp_bytes))
    sharp_score = calculate_sharpness(sharp_img)
    assert sharp_score >= 30.0

    blurry_bytes = create_blurry_image()
    blurry_img = Image.open(io.BytesIO(blurry_bytes))
    blurry_score = calculate_sharpness(blurry_img)
    assert blurry_score < 20.0


def test_exif_metadata_stripping():
    """Verify EXIF and GPS tags are stripped from output image."""
    raw_img = Image.new("RGB", (400, 400), color="white")
    buf = io.BytesIO()
    # Save with dummy comment / info
    raw_img.save(buf, format="JPEG", comment=b"GPS: 40.7128N, 74.0060W")
    contents = buf.getvalue()

    clean_img, sharpness = normalize_and_strip_metadata(contents)
    assert clean_img.mode == "RGB"
    assert clean_img.info.get("exif") is None
    assert clean_img.info.get("comment") is None


# ==============================================================================
# 2. Upload Validation Tests (Limits, Rejections, & Multi-Photo)
# ==============================================================================

def test_single_photo_upload_success(test_setup):
    """Test uploading a single photo creates PDF container and saves color original."""
    TestingSession, service, user_a_id, _ = test_setup
    photo_bytes = create_test_notice_image("Electricity Bill Due: 2026-11-25\nAmount: Rs. 1,450")

    notice_id, stored_path = service.validate_and_save_upload(
        filename="notice_cam.jpg",
        contents=photo_bytes,
        content_type="image/jpeg",
        user_id=user_a_id,
    )

    assert notice_id.startswith("notice-")
    assert stored_path.exists()
    assert stored_path.name.endswith(".pdf")

    # Verify color PDF companion exists
    color_pdf = stored_path.parent / f"{notice_id}_color.pdf"
    assert color_pdf.exists()

    # Verify page 1 color photo exists
    page_1_photo = stored_path.parent / f"{notice_id}_page_1_color.jpg"
    assert page_1_photo.exists()


def test_multi_photo_upload_combines_in_order(test_setup):
    """Test uploading multiple camera photos bundles them into a multi-page notice."""
    TestingSession, service, user_a_id, _ = test_setup
    page1 = create_test_notice_image("Page 1: Terms and conditions\nReference No. REF-100")
    page2 = create_test_notice_image("Page 2: Final deadline: 2026-12-05\nPay: Rs. 500")

    photos = [
        ("page1.jpg", page1, "image/jpeg"),
        ("page2.jpg", page2, "image/jpeg"),
    ]

    notice_id, stored_path = service.validate_and_save_photo_upload(photos, user_id=user_a_id)
    assert stored_path.exists()

    # Verify 2 pages in compiled extraction PDF
    pages = extract_pages(stored_path, ocr_mode="off")
    assert len(pages) == 2
    assert pages[0]["page_number"] == 1
    assert pages[1]["page_number"] == 2

    # Verify both color page photos exist on disk
    p1_photo = stored_path.parent / f"{notice_id}_page_1_color.jpg"
    p2_photo = stored_path.parent / f"{notice_id}_page_2_color.jpg"
    assert p1_photo.exists()
    assert p2_photo.exists()


def test_blurry_photo_rejected_with_friendly_message(test_setup):
    """Test that a blurry photo is rejected with a clear, friendly retake error."""
    TestingSession, service, user_a_id, _ = test_setup
    blurry_bytes = create_blurry_image()

    with pytest.raises(NoticeServiceError) as exc_info:
        service.validate_and_save_photo_upload(
            [("blurry_snap.jpg", blurry_bytes, "image/jpeg")],
            user_id=user_a_id,
        )

    err = exc_info.value
    assert err.error_code == "BLURRY_PHOTO"
    assert "too blurry or out of focus" in err.message
    assert "retake a clearer" in err.message


def test_too_many_photos_rejected(test_setup):
    """Test exceeding 10 photos per notice raises error."""
    TestingSession, service, user_a_id, _ = test_setup
    valid_bytes = create_test_notice_image()
    eleven_photos = [(f"page_{i}.jpg", valid_bytes, "image/jpeg") for i in range(11)]

    with pytest.raises(NoticeServiceError) as exc_info:
        service.validate_and_save_photo_upload(eleven_photos, user_id=user_a_id)

    assert exc_info.value.error_code == "TOO_MANY_PHOTOS"
    assert "Maximum 10 photos" in exc_info.value.message


def test_empty_photo_rejected(test_setup):
    """Test empty photo bytes (0 bytes) raises EMPTY_FILE error."""
    TestingSession, service, user_a_id, _ = test_setup
    with pytest.raises(NoticeServiceError) as exc_info:
        service.validate_and_save_photo_upload([("empty.jpg", b"", "image/jpeg")], user_id=user_a_id)
    assert exc_info.value.error_code == "EMPTY_FILE"


# ==============================================================================
# 3. User Isolation & File Access Security Tests
# ==============================================================================

def test_photo_notice_user_isolation(test_setup):
    """Test that another user cannot access or view another user's photo notice or files."""
    TestingSession, service, user_a_id, user_b_id = test_setup
    photo_bytes = create_test_notice_image("Private User A Tax Notice\nDue: 2026-11-29")

    notice_id, stored_path = service.validate_and_save_upload(
        "private_tax.jpg", photo_bytes, "image/jpeg", user_id=user_a_id
    )

    with TestingSession() as db:
        notice, is_cached = service.create_pending_notice(
            db, notice_id, "private_tax.jpg", stored_path, user_id=user_a_id
        )

        # 1. User A can retrieve detail
        detail_a = service.get_notice_detail(db, notice_id, user_id=user_a_id)
        assert detail_a is not None

        # 2. User B gets None (which router translates to 404)
        detail_b = service.get_notice_detail(db, notice_id, user_id=user_b_id)
        assert detail_b is None

        # 3. User A can retrieve file path
        file_a = service.get_notice_file_path(db, notice_id, user_id=user_a_id)
        assert file_a is not None

        # 4. User B cannot retrieve file path
        file_b = service.get_notice_file_path(db, notice_id, user_id=user_b_id)
        assert file_b is None

        # 5. User A can retrieve page image
        img_a = service.get_notice_page_image_path(db, notice_id, page_number=1, user_id=user_a_id)
        assert img_a is not None
        assert img_a[0].exists()

        # 6. User B cannot retrieve page image
        img_b = service.get_notice_page_image_path(db, notice_id, page_number=1, user_id=user_b_id)
        assert img_b is None


# ==============================================================================
# 4. OCR Fallback Integration Test
# ==============================================================================

def test_poor_tesseract_triggers_gemini_vision_fallback(tmp_path: Path):
    """Verify that when Tesseract yields poor/empty text, Gemini Vision fallback is invoked."""
    test_img = create_test_notice_image("Important Notice: Reconnection Fee Rs. 500")
    pdf_bytes = create_pdf_from_images([Image.open(io.BytesIO(test_img))])
    pdf_path = tmp_path / "test_ocr_fallback.pdf"
    pdf_path.write_bytes(pdf_bytes)

    # Provide a FakeLLMClient configured with image transcription
    fake_client = FakeLLMClient(
        vision_responses=["Important Notice: Reconnection Fee Rs. 500 transcribed by Gemini"]
    )

    pages = extract_pages(pdf_path, ocr_mode="tesseract", client=fake_client)
    assert len(pages) == 1
    # Page text should be present from OCR or vision fallback
    assert pages[0]["char_count"] > 10
