"""Script to generate realistic 5-page scan-like PDF fixture with raster images."""

import io
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

fixtures_dir = Path("tests/fixtures")
fixtures_dir.mkdir(parents=True, exist_ok=True)
pdf_path = fixtures_dir / "five_page_scanned_notice.pdf"

pages_data = [
    # Page 1: Header, Ref, Purpose, Deadlines
    [
        ("GOVERNMENT OF MAHARASHTRA", 50),
        ("DIRECTORATE OF HIGHER EDUCATION, PUNE", 85),
        ("POST-GRADUATE SCHOLARSHIP RENEWAL CIRCULAR 2026-27", 130),
        ("Notice Reference: DHE/SCH/2026/5120", 175),
        ("Date of Issuance: 01 November 2026", 200),
        ("All registered postgraduate scholars under state merit schemes are hereby notified", 245),
        ("that the scholarship renewal and verification dossier portal is now active.", 270),
        ("Section 1: Mandatory Renewal Deadlines", 320),
        ("   Primary Submission Deadline: 25 November 2026", 350),
        ("   Extended Deadline with surcharge: 10 December 2026", 380),
        ("Dossiers submitted after 10 December 2026 will not be accepted under any circumstances.", 420),
    ],
    # Page 2: Required Documents
    [
        ("DIRECTORATE OF HIGHER EDUCATION - VERIFICATION DOSSIER", 50),
        ("Section 2: Mandatory Required Documentation", 100),
        ("Scholars must submit original scanned copies of the following documents:", 140),
        ("1. Previous Semester Official Cumulative Marksheet", 180),
        ("2. Competent Authority Issued Income Certificate (Current Fiscal Year)", 220),
        ("3. Institutional Head Signed Minimum 75% Attendance Certificate", 260),
        ("4. Bonafide Institutional Enrolment Certificate with Seal", 300),
        ("5. Aadhaar Linked Active Bank Account Mandate Form", 340),
        ("Documents with blurred text or missing departmental stamps will be rejected.", 400),
    ],
    # Page 3: Submission Venue and Channels
    [
        ("DIRECTORATE OF HIGHER EDUCATION - SUBMISSION CHANNELS", 50),
        ("Section 3: Authorised Submission Modes and Counters", 100),
        ("Eligible candidates may complete document submission via the following channels:", 140),
        ("Mode A - State Online Portal: scholarships.maharashtra.gov.in", 190),
        ("Mode B - Institutional Verification Counter: Room 104, Administrative Block, Pune", 240),
        ("Helpline Email: scholarship-helpdesk@higheredu.maharashtra.gov.in", 290),
        ("Helpdesk Operating Hours: Monday to Friday, 10:00 AM to 5:00 PM IST", 330),
        ("Postal submissions sent to divisional offices will not be processed.", 380),
    ],
    # Page 4: Eligibility Conditions and Action Steps
    [
        ("DIRECTORATE OF HIGHER EDUCATION - ELIGIBILITY & PROCEDURE", 50),
        ("Section 4: Procedural Action Steps for Awardees", 100),
        ("Step 1: Check that you meet the conditions in the notice before applying.", 145),
        ("Step 2: Collect attendance certificate from the Head of Department.", 185),
        ("Step 3: Upload PDF copies of academic marksheets and verified income proof.", 225),
        ("Step 4: Verify uploaded submission acknowledgment at the institutional nodal counter.", 265),
        ("Eligibility Criteria Note:", 320),
        ("Scholars having any active academic backlog are not eligible for renewal.", 355),
        ("Attendance falling below the mandatory 75% threshold results in immediate cancellation.", 390),
    ],
    # Page 5: Statutory Warnings and Penalties
    [
        ("DIRECTORATE OF HIGHER EDUCATION - STATUTORY WARNINGS", 50),
        ("Section 5: Legal Disclaimers, Warnings & Consequences", 100),
        ("Warning: Cash payments are strictly prohibited at all official verification counters.", 150),
        ("Any candidate offering cash gratuity will face immediate disqualification.", 190),
        ("Penalty for Missed Deadlines:", 250),
        ("Failure to complete renewal verification on or before the final deadline shall", 290),
        ("result in immediate forfeiture of monthly scholarship stipends for subsequent terms.", 320),
        ("This notice is issued with the approval of the Competent Authority.", 400),
        ("Document End - Directorate of Higher Education, Maharashtra State", 440),
    ],
]

doc = pymupdf.open()

for page_idx, lines in enumerate(pages_data, 1):
    width_px, height_px = 1000, 1300
    img = Image.new("RGB", (width_px, height_px), color=(252, 251, 248))
    draw = ImageDraw.Draw(img)

    for text, y in lines:
        draw.text((70, y), text, fill=(25, 25, 30))

    draw.line([(60, 115), (940, 115)], fill=(120, 120, 130), width=2)
    draw.line([(60, 500), (940, 500)], fill=(180, 180, 190), width=1)
    draw.text((70, 520), f"Page {page_idx} of 5 - Scanner ID: PUNE-SCAN-094", fill=(100, 100, 110))

    img_bytes = io.BytesIO()
    img.save(img_bytes, format="JPEG", quality=85)

    page = doc.new_page(width=612, height=792)
    page.insert_image(page.rect, stream=img_bytes.getvalue())

doc.save(str(pdf_path))
doc.close()

print(f"Generated {pdf_path} ({pdf_path.stat().st_size} bytes, 5 pages)")

