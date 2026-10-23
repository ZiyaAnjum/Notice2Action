"""Generator script for programmatic test PDF fixtures.

Creates test fixtures into tests/fixtures/:
- 5 canonical digital notices (scholarship_or_college, bank, utility, tax_or_payment, government_scheme)
- 1 scanned image-only PDF with no text stream
- 1 corrupt PDF file
- 1 unrelated recipe document (out of scope)
"""

import io
from pathlib import Path

from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


def create_digital_notice_pdf(output_path: Path, pages_text: list[list[str]]) -> None:
    """Create a multi-page digital PDF with clean text."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output_path), pagesize=letter)
    width, height = letter

    for page_lines in pages_text:
        y = height - 72  # 1-inch top margin
        c.setFont("Helvetica-Bold", 14)
        if page_lines:
            c.drawString(72, y, page_lines[0])
            y -= 25

        c.setFont("Helvetica", 11)
        for line in page_lines[1:]:
            if y < 72:  # Page overflow prevention
                break
            c.drawString(72, y, line)
            y -= 18

        c.showPage()

    c.save()


def create_scanned_image_only_pdf(output_path: Path) -> None:
    """Create a 1-page PDF containing only an image and no digital text."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Generate a synthetic image (e.g., scanned receipt / blank form graphic)
    img_width, img_height = 600, 800
    img = Image.new("RGB", (img_width, img_height), color=(245, 245, 240))
    draw = ImageDraw.Draw(img)

    # Draw border and geometric lines representing a scanned form layout
    draw.rectangle([20, 20, img_width - 20, img_height - 20], outline=(180, 180, 180), width=2)
    draw.rectangle([40, 40, img_width - 40, 120], fill=(220, 220, 220))
    draw.line([40, 160, img_width - 40, 160], fill=(180, 180, 180), width=2)
    draw.line([40, 200, img_width - 40, 200], fill=(200, 200, 200), width=1)
    draw.line([40, 240, img_width - 40, 240], fill=(200, 200, 200), width=1)
    draw.line([40, 280, img_width - 40, 280], fill=(200, 200, 200), width=1)

    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    # Save to temp image file to embed in reportlab
    temp_img_path = output_path.parent / "_temp_scan.png"
    img.save(temp_img_path, format="PNG")

    try:
        c = canvas.Canvas(str(output_path), pagesize=letter)
        c.drawImage(str(temp_img_path), 50, 50, width=500, height=690)
        c.showPage()
        c.save()
    finally:
        if temp_img_path.exists():
            temp_img_path.unlink()


def create_corrupt_pdf(output_path: Path) -> None:
    """Create a corrupted PDF file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(
        b"%PDF-1.4\n%Malformed and completely damaged xref block\n0000000000 65535 f\nTRAILER\n<<>>\n%%EOF\nGARBAGE_PAYLOAD"
    )


def generate_all_fixtures(fixtures_dir: Path | None = None) -> dict[str, Path]:
    """Generate all test fixtures into the fixtures directory."""
    target_dir = fixtures_dir or (Path(__file__).resolve().parent)
    target_dir.mkdir(parents=True, exist_ok=True)

    generated: dict[str, Path] = {}

    # 1. scholarship_or_college.pdf
    sch_pages = [
        [
            "State Higher Education Directorate, Scholarship Cell",
            "Sub: Post-Graduate Merit Scholarship 2026-27 Renewal & Verification Notice",
            "Target Beneficiaries: All registered awardees under PG Merit Scheme 2025-27",
            "",
            "All eligible scholars are hereby instructed to submit semester renewal dossiers online",
            "on or before 15-11-2026 to avoid disbursement suspension.",
            "Scholars must upload their Semester II Official Marksheet and 75% attendance certificate",
            "on the state scholarship portal at https://scholarships.state.gov.in.",
            "Required documents must include college admission fee receipt and bonafide certificate.",
        ],
        [
            "College Verification Guidelines and Administrative Sanctions",
            "Principals must countersign uploaded forms within 7 working days from portal closing.",
            "Failure to submit by 15-11-2026 results in forfeiture of scholarship disbursements",
            "for subsequent academic quarters.",
            "For technical support contact the university registrar and college financial aid cell.",
            "Dean of Academic Affairs, University Examination Division.",
        ],
    ]
    sch_path = target_dir / "scholarship_or_college.pdf"
    create_digital_notice_pdf(sch_path, sch_pages)
    generated["scholarship_or_college"] = sch_path

    # 2. bank.pdf
    bank_pages = [
        [
            "Apex National Bank, Compliance & KYC Operations Division",
            "Notice of Mandatory Re-KYC Verification & Account Updation",
            "Target Audience: All Savings and Current Account Holders with Overdue KYC",
            "",
            "In terms of Reserve Bank of India (RBI) Master Directions on KYC compliance,",
            "your bank account requires mandatory Re-KYC verification and regularization.",
            "Please submit updated PAN Card copy, Aadhaar Card copy, and recent passport photo",
            "on or before 30-11-2026 to prevent account freeze.",
            "Dormant Account Alert: Failure to comply will result in total debit freeze and",
            "restriction on ATM, net banking, and UPI transactions.",
        ],
        [
            "Branch Submission and Borrower Account Protocols",
            "Cardholders and depositors may submit documents at their home branch counter",
            "or through the secure Internet banking portal using their customer ID.",
            "Equated Monthly Installment (EMI) debit instructions may fail if the account is frozen,",
            "attracting statutory cheque bounce penalty and CIBIL score impairment.",
            "Branch Manager, Retail Banking Operations & Compliance.",
        ],
    ]
    bank_path = target_dir / "bank.pdf"
    create_digital_notice_pdf(bank_path, bank_pages)
    generated["bank"] = bank_path

    # 3. utility.pdf
    utility_pages = [
        [
            "State Electricity Distribution Corporation Limited",
            "Final Notice of Electricity Disconnection - Outstanding Dues",
            "Consumer Number: 0482910492 | Domestic Tariff Category LT-1",
            "",
            "Notice of Disconnection of Power Supply under Section 56 of Electricity Act.",
            "Your electricity bill for meter reading cycle September 2026 shows unpaid arrears.",
            "Total units consumed: 420 kWh. Energy charges payable: Rs. 4,850.",
            "Immediate payment must be made on or before 10-11-2026 to prevent disconnection.",
            "Payment can be made at the local substation cash counter or online via the portal.",
        ],
        [
            "Disconnection Procedure and Reconnection Regulations",
            "If electric power supply is disconnected due to non-payment of electricity bill dues,",
            "a reconnection fee of Rs. 500 plus statutory late payment surcharge will apply.",
            "Water supply pump feeder connection will also be impacted.",
            "Executive Engineer, Sub-Divisional Electricity Board Office.",
        ],
    ]
    utility_path = target_dir / "utility.pdf"
    create_digital_notice_pdf(utility_path, utility_pages)
    generated["utility"] = utility_path

    # 4. tax_or_payment.pdf
    tax_pages = [
        [
            "Municipal Corporation Revenue Department, Property Tax Division",
            "Notice of Demand under Section 156 of Municipal Property Tax Act",
            "Property Assessment Number: TAX-PR-882910 | Taxpayer: Commercial & Residential Owner",
            "",
            "Notice of Demand for Assessment Year 2026-27.",
            "You are hereby required to pay the outstanding property tax dues amounting to Rs. 24,600.",
            "The statutory tax demand challan must be paid in full on or before 31-12-2026.",
            "Payment can be deposited online via municipal revenue treasury portal or at designated banks.",
            "Please quote your taxpayer identification number on the bank challan.",
        ],
        [
            "Statutory Penalties and Revenue Recovery Measures",
            "If the tax demand is not discharged within the prescribed period, interest under statutory",
            "provisions at 1% per month plus a penal cess of 10% shall be levied on tax arrears.",
            "Distress warrants and attachment of municipal property will be initiated against defaulting assesses.",
            "Assistant Commissioner of Revenue & Taxation, Assessment Zone 4.",
        ],
    ]
    tax_path = target_dir / "tax_or_payment.pdf"
    create_digital_notice_pdf(tax_path, tax_pages)
    generated["tax_or_payment"] = tax_path

    # 5. government_scheme.pdf
    govt_pages = [
        [
            "Department of Agriculture & Farmers Welfare, Ministry of Rural Development",
            "Government Welfare Scheme: PM Kisan Samman Nidhi & Farmer Subsidy",
            "Target: All registered beneficiaries under PM Kisan and State Farmer Welfare Scheme",
            "",
            "Circular on Mandatory Aadhaar Seeding and e-KYC Verification for Direct Benefit Transfer (DBT).",
            "All farmer beneficiaries entitled to financial assistance under PM Kisan Samman Nidhi Yojana",
            "must complete biometric e-KYC on the government portal before 20-11-2026.",
            "Direct Benefit Transfer (DBT) subsidy disbursement for the upcoming quarter will be withheld",
            "for unverified ration card and land record holders.",
        ],
        [
            "Gram Panchayat Assistance and Social Welfare Camps",
            "Beneficiaries can visit the nearest Common Service Centre (CSC) or Gram Panchayat office",
            "with land ownership documents, ration card, and Aadhaar card.",
            "Social welfare department officers will conduct field camps for eligible rural households.",
            "Nodal Officer, Direct Benefit Transfer Welfare Scheme.",
        ],
    ]
    govt_path = target_dir / "government_scheme.pdf"
    create_digital_notice_pdf(govt_path, govt_pages)
    generated["government_scheme"] = govt_path

    # 6. scanned_image_only.pdf
    scan_path = target_dir / "scanned_image_only.pdf"
    create_scanned_image_only_pdf(scan_path)
    generated["scanned_image_only"] = scan_path

    # 7. corrupt_file.pdf
    corrupt_path = target_dir / "corrupt_file.pdf"
    create_corrupt_pdf(corrupt_path)
    generated["corrupt_file"] = corrupt_path

    # 8. recipe_unrelated.pdf (out of scope)
    recipe_pages = [
        [
            "Ultimate Homemade Chocolate Chip Cookies Recipe",
            "",
            "Prep time: 15 minutes | Cook time: 10 minutes | Servings: 24 cookies",
            "",
            "Ingredients:",
            "- 2 and 1/4 cups all-purpose flour",
            "- 1 teaspoon baking soda",
            "- 1/2 teaspoon fine table salt",
            "- 1 cup unsalted butter, softened to room temperature",
            "- 3/4 cup granulated white sugar",
            "- 3/4 cup packed brown sugar",
            "- 1 teaspoon pure vanilla extract",
            "- 2 large farm-fresh eggs",
            "- 2 cups semi-sweet chocolate chips",
            "",
            "Instructions:",
            "1. Preheat oven to 375 degrees Fahrenheit (190 degrees Celsius).",
            "2. In a small bowl, whisk together flour, baking soda, and salt.",
            "3. In a large bowl, beat softened butter and sugars until smooth and creamy.",
            "4. Beat in vanilla extract and eggs one at a time.",
            "5. Gradually blend in the dry flour mixture until combined, then fold in chocolate chips.",
            "6. Drop rounded balls onto an ungreased baking sheet.",
            "7. Bake for 9 to 11 minutes until edges are golden brown.",
            "8. Cool on wire baking rack for 10 minutes before serving. Enjoy!",
        ]
    ]
    recipe_path = target_dir / "recipe_unrelated.pdf"
    create_digital_notice_pdf(recipe_path, recipe_pages)
    generated["recipe_unrelated"] = recipe_path

    return generated


if __name__ == "__main__":
    fixtures = generate_all_fixtures()
    print(f"Generated {len(fixtures)} fixtures in {Path(__file__).resolve().parent}")
