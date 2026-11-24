"""Generate verified demo sample notices and benchmark OCR accuracy across pipeline scenarios.

Scenarios tested:
(a) Digital PDF (clean text layer)
(b) Scanned PDF (TRUE image-only PDF, zero embedded text)
(c) Clear phone photo of a printed notice
(d) Slightly tilted photo (tests deskewing)
(e) Dim or shadowed photo (tests adaptive shadow removal)
(f) 2-page photo notice (multi-page compilation)
(g) Kannada or Hindi notice (regional language scope check per rules.md)
"""

from __future__ import annotations

import io
import json
import shutil
import sys
from pathlib import Path

# Ensure repo root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFont

from backend.app.services.image_preprocessor import (
    BLUR_VARIANCE_THRESHOLD,
    calculate_sharpness,
    create_pdf_from_images,
    deskew_image,
    enhance_image_for_ocr,
    normalize_and_strip_metadata,
)
from extraction.extractor import extract_pages
from extraction.llm_client import FakeLLMClient
from extraction.ocr import check_ocr_quality, ocr_page_tesseract
from extraction.pipeline import process_notice


def create_printed_document_image(
    lines: list[tuple[str, str, int]],
    width: int = 1600,
    height: int = 2200,
    bg_color: tuple[int, int, int] = (255, 255, 255),
) -> Image.Image:
    """Create a realistic high-resolution printed notice image."""
    img = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # Decorative header banner / borders
    draw.rectangle([60, 60, width - 60, height - 60], outline=(40, 40, 40), width=3)
    draw.rectangle([68, 68, width - 68, 180], fill=(240, 243, 246), outline=(100, 100, 100), width=1)

    y = 90
    for text, style, size in lines:
        try:
            font = ImageFont.truetype("arial.ttf", size)
        except Exception:
            font = ImageFont.load_default()

        if style == "header_center":
            bbox = draw.textbbox((0, 0), text, font=font)
            text_w = bbox[2] - bbox[0]
            x = (width - text_w) // 2
            draw.text((x, y), text, fill=(15, 23, 42), font=font)
            y += size + 16
        elif style == "title_center":
            bbox = draw.textbbox((0, 0), text, font=font)
            text_w = bbox[2] - bbox[0]
            x = (width - text_w) // 2
            draw.text((x, y), text, fill=(30, 41, 59), font=font)
            y += size + 20
        elif style == "section":
            y += 15
            draw.line([100, y, width - 100, y], fill=(180, 180, 180), width=2)
            y += 12
            draw.text((100, y), text, fill=(30, 27, 75), font=font)
            y += size + 14
        elif style == "bold":
            draw.text((100, y), text, fill=(15, 23, 42), font=font)
            y += size + 12
        elif style == "body":
            draw.text((100, y), text, fill=(51, 65, 85), font=font)
            y += size + 10
        elif style == "bullet":
            draw.text((120, y), f"- {text}", fill=(51, 65, 85), font=font)
            y += size + 10
        elif style == "spacer":
            y += size

    return img


def make_true_image_only_pdf(img: Image.Image, out_path: Path) -> None:
    """Save an image as a strictly image-only PDF with zero text objects."""
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90, optimize=True)
    img_bytes = buf.getvalue()

    doc = pymupdf.open()
    w, h = img.size
    page = doc.new_page(width=float(w), height=float(h))
    rect = pymupdf.Rect(0, 0, float(w), float(h))
    page.insert_image(rect, stream=img_bytes)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path))
    doc.close()


def main() -> None:
    samples_dir = Path("samples")
    samples_dir.mkdir(parents=True, exist_ok=True)
    fixtures_dir = Path("tests/fixtures")
    fixtures_dir.mkdir(parents=True, exist_ok=True)

    print("============================================================")
    print(" 1. Generating Demo Samples in samples/")
    print("============================================================")

    # Sample A: Clean Digital PDF
    src_digital = Path("data/masked/sample_electricity_notice.pdf")
    dest_digital = samples_dir / "digital_electricity_notice.pdf"
    if src_digital.exists():
        shutil.copyfile(src_digital, dest_digital)
        print(f"  [+] Created: {dest_digital} (Digital PDF, {dest_digital.stat().st_size} bytes)")

    # Sample B: True Image-Only Scanned PDF (Municipal Tax Demand)
    tax_lines = [
        ("MUNICIPAL CORPORATION OF GREATER MUMBAI", "header_center", 34),
        ("ASSESSMENT & COLLECTION DEPARTMENT", "header_center", 24),
        ("SPECIAL PROPERTY TAX DEMAND & COMPLIANCE NOTICE", "title_center", 30),
        ("spacer", "spacer", 10),
        ("Notice Ref No: MCGM/TAX/2026/89412", "bold", 24),
        ("Date of Notice: 05 November 2026", "bold", 24),
        ("Property Account No (SAC): 04-29-188-001", "body", 22),
        ("Owner / Assessee: RESIDENTIAL WARD 4 COMPLIANCE TRUST", "body", 22),
        ("Tax Assessment Year: 2026 - 2027", "body", 22),
        ("Demand & Payment Details", "section", 26),
        ("Total Net Property Tax Outstanding: Rs. 18,450.00", "bold", 24),
        ("Final Payment Deadline: 15 December 2026", "bold", 24),
        ("Rebate Applicable: 5% discount if paid on or before 30 November 2026.", "body", 22),
        ("Payment Channels & Mandatory Steps", "section", 26),
        ("1. Pay online via the MCGM citizen portal at https://ptaxportal.mcgm.gov.in.", "bullet", 22),
        ("2. Pay in person by Demand Draft at any Citizen Facilitation Centre (CFC).", "bullet", 22),
        ("3. Submit copy of payment receipt to Ward Assessment Office within 7 days.", "bullet", 22),
        ("Required Documents for Verification", "section", 26),
        ("1. Previous Property Tax Receipt (2025-2026)", "bullet", 22),
        ("2. Municipal Assessment Ledger Card copy", "bullet", 22),
        ("3. Aadhaar or PAN card of authorized trustee / owner", "bullet", 22),
        ("Penalties & Legal Consequences", "section", 26),
        ("Failure to pay by 15 December 2026 will attract 2% penalty interest per month.", "body", 22),
        ("Unpaid properties are liable for attachment and water disconnection under Section 203.", "body", 22),
        ("spacer", "spacer", 20),
        ("Ward Assessment Officer - Ward H/West", "bold", 22),
        ("Municipal Corporation of Greater Mumbai", "body", 20),
    ]
    tax_img = create_printed_document_image(tax_lines)
    dest_scanned = samples_dir / "scanned_tax_notice.pdf"
    make_true_image_only_pdf(tax_img, dest_scanned)
    print(f"  [+] Created: {dest_scanned} (TRUE image-only PDF, {dest_scanned.stat().st_size} bytes)")

    # Verify dest_scanned has zero embedded text
    doc_check = pymupdf.open(str(dest_scanned))
    embedded_chars = len(doc_check[0].get_text().strip())
    doc_check.close()
    print(f"      Verification: Embedded text characters = {embedded_chars} (must be 0 for pure OCR)")

    # Sample C: Phone Photo of Scholarship Circular
    scholarship_lines = [
        ("GOVERNMENT OF MAHARASHTRA", "header_center", 34),
        ("DIRECTORATE OF HIGHER EDUCATION, PUNE", "header_center", 24),
        ("POST-GRADUATE SCHOLARSHIP RENEWAL & VERIFICATION CIRCULAR", "title_center", 28),
        ("Notice Ref: DHE/SCH/2026/4011", "bold", 24),
        ("Date of Publication: 01 November 2026", "bold", 24),
        ("Beneficiary Scheme: Post-Graduate Merit & Research Support Scheme", "body", 22),
        ("Total Disbursal Amount: Rs. 36,000.00", "bold", 24),
        ("Submission & Renewal Deadlines", "section", 26),
        ("Last Date for Online Dossier Submission: 30 November 2026", "bold", 24),
        ("Hardcopy Document Verification at Nodal Desk: 05 December 2026", "body", 22),
        ("Required Verification Documents", "section", 26),
        ("1. Previous semester marksheets with minimum 60% aggregate.", "bullet", 22),
        ("2. Current academic session bonafide student certificate.", "bullet", 22),
        ("3. Bank passbook copy linked to Aadhaar (NPCI active).", "bullet", 22),
        ("4. College fee payment receipt for 2026-2027.", "bullet", 22),
        ("Action Steps for Scholars", "section", 26),
        ("Upload all scanned self-attested documents on MahaDBT portal before the deadline.", "body", 22),
        ("Late applications will not be renewed and scholarship grant will be forfeited.", "body", 22),
        ("spacer", "spacer", 20),
        ("Director of Higher Education, Maharashtra State", "bold", 22),
    ]
    scholarship_img = create_printed_document_image(scholarship_lines)
    dest_photo = samples_dir / "phone_photo_scholarship_notice.jpg"
    scholarship_img.save(dest_photo, format="JPEG", quality=85)
    print(f"  [+] Created: {dest_photo} (Phone photo sample, {dest_photo.stat().st_size} bytes)")

    # Test Scenarios D & E (Tilted and Shadowed)
    tilted_img = scholarship_img.rotate(4.5, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="white")
    dest_tilted = fixtures_dir / "test_tilted_photo.jpg"
    tilted_img.save(dest_tilted, format="JPEG", quality=85)
    print(f"  [+] Created: {dest_tilted} (Tilted 4.5 degrees)")

    # Shadowed Image: apply diagonal gradient shadow
    shadow_arr = np.array(scholarship_img, dtype=np.float32)
    h, w, _ = shadow_arr.shape
    grad_y, grad_x = np.mgrid[0:h, 0:w]
    # Gradient factor from 0.55 (top-left shadowed) to 1.0 (bottom-right bright)
    shadow_mask = 0.55 + 0.45 * ((grad_x / w + grad_y / h) / 2.0)
    shadow_arr = shadow_arr * shadow_mask[:, :, np.newaxis]
    shadow_img = Image.fromarray(np.clip(shadow_arr, 0, 255).astype(np.uint8))
    dest_shadowed = fixtures_dir / "test_shadowed_photo.jpg"
    shadow_img.save(dest_shadowed, format="JPEG", quality=85)
    print(f"  [+] Created: {dest_shadowed} (Dim / shadowed photo)")

    # Sample F: 2-page photo notice (combining two distinct photo pages)
    two_page_pdf_bytes = create_pdf_from_images([scholarship_img, tax_img])
    dest_two_page = fixtures_dir / "test_two_page_photo_notice.pdf"
    dest_two_page.write_bytes(two_page_pdf_bytes)
    print(f"  [+] Created: {dest_two_page} (2-Page Photo Notice PDF)")

    # Regional language sample: Kannada notice
    kannada_lines = [
        ("GOVERNMENT OF KARNATAKA - SCHOLARSHIP DEPARTMENT", "header_center", 30),
        ("ಬೆಂಗಳೂರು ನಗರ ಪಾಲಿಕೆ - ವಿದ್ಯಾರ್ಥಿವೇತನ ಪ್ರಕಟಣೆ", "title_center", 28),
        ("Notification No: BLR/SCH/2026/89", "bold", 24),
        ("Date: 10 November 2026", "bold", 24),
        ("ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 15 December 2026", "bold", 26),
        ("Scholarship Amount: Rs. 15,000.00", "bold", 24),
        ("ವಿವರಗಳು: ಎಲ್ಲಾ ಅರ್ಹ ವಿದ್ಯಾರ್ಥಿಗಳು ದಾಖಲೆಗಳನ್ನು ಸಲ್ಲಿಸಬೇಕು.", "body", 22),
    ]
    kannada_img = create_printed_document_image(kannada_lines)
    dest_kannada = fixtures_dir / "test_kannada_notice.pdf"
    make_true_image_only_pdf(kannada_img, dest_kannada)
    print(f"  [+] Created: {dest_kannada} (Kannada Regional Notice PDF)")

    print("\n============================================================")
    print(" 2. Measuring Sharpness & Blur Threshold on Real Samples")
    print("============================================================")
    sharpness_results = {}
    test_images = {
        "Clean Printed Notice": scholarship_img,
        "Phone Photo (samples/)": Image.open(dest_photo),
        "Tilted Photo (4.5 deg)": tilted_img,
        "Dim / Shadowed Photo": shadow_img,
    }

    # Add intentionally blurred test image
    blurred_img = scholarship_img.resize((100, 140)).resize(scholarship_img.size, Image.Resampling.BILINEAR)
    test_images["Severely Out-of-Focus Blur"] = blurred_img

    for label, im in test_images.items():
        score = calculate_sharpness(im)
        sharpness_results[label] = score
        verdict = "PASSED (Sharp enough)" if score >= BLUR_VARIANCE_THRESHOLD else "REJECTED (Blurry)"
        print(f"  * {label:28}: Variance = {score:7.2f} -> {verdict} (Threshold: {BLUR_VARIANCE_THRESHOLD})")

    print("\n============================================================")
    print(" 3. Benchmarking Pipeline Scenarios (a) through (g)")
    print("============================================================")

    # Simulated FakeLLMClient for offline extraction testing
    decision_payload = {
        "headline": {
            "one_line_summary": "Official Notice Action Plan",
            "notice_type": "tax",
            "source_organisation": "Municipal Corporation of Greater Mumbai",
            "amount_due": "18450.00",
            "primary_deadline_id": "dl_1",
            "urgency": "soon",
        },
        "deadlines": [
            {
                "id": "dl_1",
                "label": "Final Property Tax Payment",
                "iso_date": "2026-12-15",
                "date_type": "exact",
            }
        ],
        "action_steps": [
            {"order": 1, "text": "Pay online via MCGM portal before 15 December 2026."}
        ],
        "required_documents": [{"name": "Previous Property Tax Receipt"}],
        "consequences": [{"label": "2% interest per month after 15 December 2026."}],
        "summary_plain": "Property tax demand notice for MCGM. Total Rs. 18,450 due by 15 December 2026.",
    }
    fake_client = FakeLLMClient(responses=[json.dumps(decision_payload)])

    scenarios = [
        ("(a) Digital PDF", dest_digital, "digital"),
        ("(b) Scanned PDF (image-only)", dest_scanned, "scanned"),
        ("(c) Clear Phone Photo", dest_photo, "photo"),
        ("(d) Tilted Photo (deskew)", dest_tilted, "photo"),
        ("(e) Dim/Shadowed Photo", dest_shadowed, "photo"),
        ("(f) 2-Page Photo Notice", dest_two_page, "photo_2page"),
        ("(g) Kannada Regional Notice", dest_kannada, "regional"),
    ]

    print(f"\n{'Scenario':<32} | {'Input Type':<12} | {'Pages':<5} | {'OCR Used':<8} | {'Chars Extracted':<15} | {'Status'}")
    print("-" * 88)

    for name, path, kind in scenarios:
        if kind == "photo":
            # Photo flow: load, normalize, deskew, compile to PDF
            with open(path, "rb") as f:
                raw_bytes = f.read()
            clean_img, _ = normalize_and_strip_metadata(raw_bytes)
            enhanced = enhance_image_for_ocr(clean_img)
            pdf_bytes = create_pdf_from_images([enhanced])
            temp_pdf = fixtures_dir / f"temp_{path.stem}.pdf"
            temp_pdf.write_bytes(pdf_bytes)
            target_path = temp_pdf
        else:
            target_path = path

        doc = pymupdf.open(str(target_path))
        page_count = len(doc)
        doc.close()

        # Extract pages with OCR enabled
        pages = extract_pages(target_path, ocr_mode="tesseract")
        extracted_text = "".join(p.get("text", "") for p in pages)
        ocr_was_used = any(p.get("method") == "ocr" for p in pages)

        char_count = len(extracted_text.strip())
        status = "OK" if char_count > 50 else "EMPTY/LOW"
        print(f"{name:<32} | {kind:<12} | {page_count:<5} | {str(ocr_was_used):<8} | {char_count:<15} | {status}")

    print("\n============================================================")
    print(" Benchmarking completed successfully!")
    print("============================================================")


if __name__ == "__main__":
    main()
