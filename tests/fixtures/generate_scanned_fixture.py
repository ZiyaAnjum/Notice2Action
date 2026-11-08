"""Script to generate scan-like PDF fixture with text rendered into a raster image."""

import io
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

fixtures_dir = Path("tests/fixtures")
fixtures_dir.mkdir(parents=True, exist_ok=True)
pdf_path = fixtures_dir / "scanned_notice_with_text.pdf"

width_px, height_px = 1000, 1300
img = Image.new("RGB", (width_px, height_px), color=(250, 249, 246))
draw = ImageDraw.Draw(img)

lines = [
    ("GOVERNMENT OF MAHARASHTRA", 50),
    ("DIRECTORATE OF HIGHER EDUCATION, PUNE", 85),
    ("POST-GRADUATE SCHOLARSHIP RENEWAL NOTICE 2026-27", 130),
    ("Notice Reference: DHE/SCH/2026/4011", 175),
    ("Date of Issuance: 01 November 2026", 200),
    ("All eligible postgraduate scholars are hereby informed that the scholarship renewal portal", 240),
    ("is open for submission of academic dossiers for the upcoming academic semester.", 265),
    ("1. Mandatory Submission Deadlines:", 310),
    ("   Primary Application Deadline: 25 November 2026", 335),
    ("   Extended Deadline with late fee: 10 December 2026", 360),
    ("2. Required Verification Documents:", 405),
    ("   - Previous Semester Official Marksheet", 430),
    ("   - Tahsildar Verified Income Certificate", 455),
    ("   - Bonafide Institutional Enrolment Certificate", 480),
    ("3. Submission Venue and Helpdesk:", 525),
    ("   Online Portal: dhescholarship.maharashtra.gov.in", 550),
    ("   Physical Verification Counter: Room 104, Central Administrative Building, Pune", 575),
    ("4. Statutory Notice Warnings & Conditions:", 620),
    ("   Warning: Cash transactions are strictly prohibited at verification counters.", 645),
    ("   Applications with incomplete seals will be summarily rejected without review.", 670),
]

for text, y in lines:
    draw.text((70, y), text, fill=(30, 30, 35))

draw.line([(60, 115), (940, 115)], fill=(120, 120, 130), width=2)
draw.line([(60, 720), (940, 720)], fill=(180, 180, 190), width=1)
draw.text((70, 735), "Official Document - Scanner ID: PUNE-DOCSCAN-094", fill=(100, 100, 110))

# Save image as JPEG for compact PDF size
img_bytes = io.BytesIO()
img.save(img_bytes, format="JPEG", quality=85)

doc = pymupdf.open()
page = doc.new_page(width=612, height=792)
page.insert_image(page.rect, stream=img_bytes.getvalue())
doc.save(str(pdf_path))
doc.close()

print(f"Generated {pdf_path} ({pdf_path.stat().st_size} bytes)")
