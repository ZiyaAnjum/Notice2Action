"""Image preprocessing, validation, blur detection, and multi-page combination.

Implements requirements:
- EXIF orientation correction and metadata/GPS stripping.
- Lightweight numpy-based sharpness check for blur detection.
- OCR copy enhancement: grayscale, auto-contrast, enhancement.
- Preservation of original color photos for source viewing.
- PyMuPDF-based multi-page compilation into clean PDF containers.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import pymupdf

logger = logging.getLogger(__name__)

# Image constraints
MAX_PHOTOS_PER_NOTICE = 10
MAX_IMAGE_DIMENSION = 2000
JPEG_COMPRESSION_QUALITY = 85
# Tuned threshold: 15.0 safely allows handheld indoor and dim/textured paper notices
# while rejecting severely unfocused or motion-blurred captures (which typically score < 10.0).
BLUR_VARIANCE_THRESHOLD = 15.0
MIN_PHOTO_SIZE_BYTES = 500

SUPPORTED_IMAGE_MIMES = {
    "image/jpeg": "JPEG",
    "image/jpg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}


class ImageProcessingError(Exception):
    """Exception raised for image validation, quality, or processing failures."""

    def __init__(self, error_code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code


def detect_image_format(contents: bytes) -> str | None:
    """Detect image format by inspecting file magic bytes."""
    if len(contents) < 12:
        return None
    if contents.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if contents.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if contents[:4] == b"RIFF" and contents[8:12] == b"WEBP":
        return "WEBP"
    return None


def calculate_sharpness(img: Image.Image) -> float:
    """Calculate image sharpness using numpy Laplacian variance on grayscale pixels.

    A low variance (e.g. < 30.0) indicates an out-of-focus or severely blurred photo.
    """
    gray = img.convert("L")
    # Downsample if very large for instant calculation
    if max(gray.size) > 1000:
        gray.thumbnail((1000, 1000), Image.Resampling.BILINEAR)

    arr = np.array(gray, dtype=np.float32)
    if arr.shape[0] < 3 or arr.shape[1] < 3:
        return 100.0

    # 3x3 discrete Laplacian operator
    laplacian = (
        arr[:-2, 1:-1] + arr[2:, 1:-1] + arr[1:-1, :-2] + arr[1:-1, 2:] - 4 * arr[1:-1, 1:-1]
    )
    variance = float(laplacian.var())
    return variance


def normalize_and_strip_metadata(raw_bytes: bytes) -> tuple[Image.Image, float]:
    """Validate image bytes, correct EXIF orientation, strip EXIF/GPS tags, and check sharpness.

    Returns:
        (clean_color_image, sharpness_score)
    """
    fmt = detect_image_format(raw_bytes)
    if not fmt:
        raise ImageProcessingError(
            error_code="UNSUPPORTED_IMAGE_TYPE",
            message="Unsupported image format. Please capture or upload a JPEG, PNG, or WEBP photo.",
            status_code=400,
        )

    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img.load()
    except Exception as err:
        raise ImageProcessingError(
            error_code="CORRUPT_IMAGE",
            message=f"The image appears to be corrupted or damaged: {err}",
            status_code=400,
        ) from None

    # 1. Correct orientation from EXIF tags
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # 2. Resize if dimension exceeds 2000px while maintaining aspect ratio
    w, h = img.size
    if max(w, h) > MAX_IMAGE_DIMENSION:
        scale = MAX_IMAGE_DIMENSION / max(w, h)
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        img = img.resize(new_size, Image.Resampling.LANCZOS)

    # 3. Strip all EXIF / GPS metadata by copying raw pixels into a brand-new RGB image
    clean_color = Image.new("RGB", img.size)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        clean_color.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[3])
    else:
        clean_color.paste(img.convert("RGB"))

    # 4. Check sharpness
    sharpness = calculate_sharpness(clean_color)

    return clean_color, sharpness


def deskew_image(img: Image.Image, max_angle: float = 10.0, step: float = 1.0) -> tuple[Image.Image, float]:
    """Detect and correct document skew using horizontal projection profile variance.

    Tilted text lines produce flat row sums across vertical projections, while
    horizontally aligned text lines produce sharp peaks and deep troughs.
    The angle maximizing horizontal projection variance is the true skew angle.

    Returns:
        (deskewed_image, detected_angle)
    """
    w, h = img.size
    if w < 50 or h < 50:
        return img, 0.0

    # Downsample to fast analysis thumbnail
    thumb_h = 400
    thumb_w = max(50, int(w * (thumb_h / h)))
    thumb = img.convert("L").resize((thumb_w, thumb_h), Image.Resampling.BILINEAR)

    thumb_arr = np.array(thumb, dtype=np.float32)
    median_val = float(np.median(thumb_arr))

    best_angle = 0.0
    max_variance = -1.0

    angles = np.arange(-max_angle, max_angle + step, step)
    for angle in angles:
        rotated_thumb = thumb.rotate(float(angle), resample=Image.Resampling.NEAREST, fillcolor=255)
        rot_arr = (np.array(rotated_thumb) < median_val).astype(np.float32)
        row_sums = rot_arr.sum(axis=1)
        variance = float(np.var(row_sums))
        if variance > max_variance:
            max_variance = variance
            best_angle = float(angle)

    if abs(best_angle) >= 0.5:
        logger.info("Deskewing image by %.1f degrees (max projection variance: %.1f).", best_angle, max_variance)
        deskewed = img.rotate(best_angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="white")
        return deskewed, best_angle

    return img, 0.0


def enhance_image_for_ocr(img: Image.Image) -> Image.Image:
    """Produce a high-contrast, preprocessed grayscale COPY of the photo for OCR.

    Applies:
    1. Deskewing to straighten tilted text lines.
    2. Small text upscaling if dimension < 1200px.
    3. Adaptive background illumination normalization to remove shadows.
    4. Auto-contrast stretching and edge contrast boost.
    Keeps the original color image untouched.
    """
    # 1. Deskew
    deskewed, _ = deskew_image(img, max_angle=10.0, step=1.0)

    # 2. Upscale small text / low resolution images
    w, h = deskewed.size
    if min(w, h) < 1200:
        scale = 1200.0 / min(w, h)
        if scale <= 3.0:
            deskewed = deskewed.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

    # 3. Grayscale conversion
    gray = deskewed.convert("L")

    # 4. Adaptive shadow removal via local background illumination estimation
    try:
        bg = gray.filter(ImageFilter.GaussianBlur(radius=25))
        gray_arr = np.array(gray, dtype=np.float32)
        bg_arr = np.array(bg, dtype=np.float32)
        norm_arr = np.clip((gray_arr / (bg_arr + 1e-4)) * 220.0, 0, 255).astype(np.uint8)
        gray = Image.fromarray(norm_arr)
    except Exception:
        pass

    # 5. Auto-contrast stretching
    try:
        enhanced = ImageOps.autocontrast(gray, cutoff=2)
    except Exception:
        enhanced = gray

    # 6. Moderate contrast boost for crisp text edges
    try:
        contrast = ImageEnhance.Contrast(enhanced)
        enhanced = contrast.enhance(1.4)
    except Exception:
        pass

    return enhanced


def save_image_as_jpeg_bytes(img: Image.Image, quality: int = JPEG_COMPRESSION_QUALITY) -> bytes:
    """Save PIL Image as optimized JPEG bytes without any EXIF tags."""
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def create_pdf_from_images(images: list[Image.Image]) -> bytes:
    """Combine a list of PIL Images into a standardized multi-page PDF document in memory using PyMuPDF."""
    doc = pymupdf.open()
    for img in images:
        img_bytes = save_image_as_jpeg_bytes(img)
        w, h = img.size
        # Create page matching image dimensions at 72 DPI points
        page = doc.new_page(width=float(w), height=float(h))
        rect = pymupdf.Rect(0, 0, float(w), float(h))
        page.insert_image(rect, stream=img_bytes)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes
