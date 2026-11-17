"""Generate layout robustness PDF fixtures for Phase 7b in tests/fixtures/.

Fixtures generated:
1. letterhead_table.pdf: Letterhead + table of dates and fees.
2. two_column.pdf: Two-column notice layout.
3. bilingual.pdf: Bilingual notice (English + Hindi/Marathi) using Unicode font.
4. repeated_footer.pdf: Multi-page notice with repeated boilerplate footer.
5. twelve_page.pdf: 12-page comprehensive official guidelines document.
"""

from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def register_unicode_font() -> str:
    """Attempt to register a system Unicode TrueType font supporting Indic scripts.

    Returns font name registered, or 'Helvetica' if no system Indic font is found.
    """
    system_font_candidates = [
        ("Nirmala", "C:/Windows/Fonts/Nirmala.ttc", 0),
        ("Mangal", "C:/Windows/Fonts/mangal.ttf", None),
        ("Aparajita", "C:/Windows/Fonts/aparaj.ttf", None),
        ("ArialUnicode", "C:/Windows/Fonts/arialuni.ttf", None),
        ("SegoeUI", "C:/Windows/Fonts/segoeui.ttf", None),
    ]

    for font_name, font_path, sub_idx in system_font_candidates:
        if Path(font_path).exists():
            try:
                if sub_idx is not None:
                    pdfmetrics.registerFont(TTFont(font_name, font_path, subfontIndex=sub_idx))
                else:
                    pdfmetrics.registerFont(TTFont(font_name, font_path))
                return font_name
            except Exception:
                continue

    return "Helvetica"


def create_letterhead_table_pdf(output_path: Path) -> None:
    """Fixture 1: Letterhead + table of dates and fees."""
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )
    styles = getSampleStyleSheet()
    story = []

    # Letterhead
    story.append(Paragraph("<b>MUNICIPAL CORPORATION OF GREATER MUMBAI</b>", styles["Title"]))
    story.append(Paragraph("Assessment & Collection Department, Ward G-South, Mumbai 400018", styles["Normal"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.navy, spaceAfter=15))

    story.append(Paragraph("<b>PROPERTY TAX REVISED ASSESSMENT & DEMAND NOTICE 2026-27</b>", styles["Heading2"]))
    story.append(Paragraph("Notice Reference: MCGM/AC/TAX/2026/8941 &nbsp;&nbsp;&nbsp;&nbsp; Date of Issue: 01 November 2026", styles["Normal"]))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "Notice is hereby served upon all commercial and residential property owners in Ward G-South regarding "
        "the scheduled property tax assessments for the second half of fiscal year 2026-27. "
        "Pay online through the corporation municipal portal propertytax.mcgm.gov.in or at designated citizen facilitation counters.",
        styles["Normal"],
    ))
    story.append(Spacer(1, 15))

    # Table of dates and fees
    table_data = [
        ["Payment Category", "Due Date", "Surcharge / Incentive", "Payable Amount"],
        ["Early Bird Advance", "15 November 2026", "2% Rebate (Rs. 300 concession)", "Rs. 14,700"],
        ["Regular Standard Payment", "30 November 2026", "No concession / Nil penalty", "Rs. 15,000"],
        ["Extended with Late Fee", "15 December 2026", "2% Surcharge penalty (Rs. 300)", "Rs. 15,300"],
    ]
    t = Table(table_data, colWidths=[150, 110, 150, 90])
    t.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2B4C7E")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#EBF3FA")),
            ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#FFF0F0")),
        ])
    )
    story.append(t)
    story.append(Spacer(1, 15))

    story.append(Paragraph(
        "<b>Notice Warning:</b> Cash payments exceeding Rs. 10,000 are not accepted at citizen facilitation counters. "
        "Payments above this limit must be remitted via demand draft, net banking, or UPI.",
        styles["Normal"],
    ))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "Required verification documents upon counter payment: 1. Previous Year Tax Receipt 2. Property Assessment Card SAC-40291.",
        styles["Normal"],
    ))

    doc.build(story)


def create_two_column_pdf(output_path: Path) -> None:
    """Fixture 2: Two-column layout notice."""
    c = canvas.Canvas(str(output_path), pagesize=letter)
    width, height = letter

    # Top Header banner
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, height - 50, "STATE UNIVERSITY ADMISSION & SCHOLARSHIP BOARD")
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(width / 2, height - 70, "ANNUAL POSTGRADUATE FELLOWSHIP NOTIFICATION 2026-27")
    c.setLineWidth(1)
    c.line(54, height - 80, width - 54, height - 80)

    # Left Column (X: 54 to 280)
    col1_x = 54
    y1 = height - 105
    c.setFont("Helvetica-Bold", 11)
    c.drawString(col1_x, y1, "SECTION 1: ELIGIBILITY & INSTRUCTIONS")
    y1 -= 18

    col1_lines = [
        "All postgraduate candidates seeking departmental",
        "fellowship grants must satisfy the specified criteria.",
        "Check that you meet the conditions in the notice:",
        "1. Candidate must secure minimum 60% aggregate marks.",
        "2. Candidate must maintain 75% semester attendance.",
        "Students with active backlogs are not eligible.",
        "",
        "Required Documents for Verification:",
        "- Qualifying Bachelor Degree Certificate",
        "- Official Semester Grade Transcript",
        "- Institutional Recommendation Letter",
        "",
        "Action Steps for Submission:",
        "1. Verify eligibility credentials.",
        "2. Upload verified documents to university portal.",
        "3. Submit physical hard copy dossier to Dean Office.",
    ]
    c.setFont("Helvetica", 9)
    for line in col1_lines:
        if line.startswith("Required Documents") or line.startswith("Action Steps"):
            c.setFont("Helvetica-Bold", 9)
        elif line.startswith("1.") or line.startswith("-"):
            c.setFont("Helvetica", 9)
        c.drawString(col1_x, y1, line)
        y1 -= 14

    # Right Column (X: 320 to 558)
    col2_x = 320
    y2 = height - 105
    c.setFont("Helvetica-Bold", 11)
    c.drawString(col2_x, y2, "SECTION 2: CALENDAR & VENUES")
    y2 -= 18

    col2_lines = [
        "Important Application Deadlines:",
        "Primary Application Deadline: 25 November 2026",
        "All regular dossiers must be registered by this date.",
        "",
        "Extended Deadline with Late Fee: 05 December 2026",
        "Submissions after 25 November require Rs. 500 late fee.",
        "",
        "Submission Channels & Contact Counter:",
        "Online Portal: pgfellowship.stateuniv.ac.in",
        "Physical Counter: Administrative Block Counter 4",
        "Operating Hours: Monday to Friday 10:00 AM to 4:00 PM",
        "",
        "Warning and Conditions:",
        "Incomplete dossiers lacking supervisor seal will be",
        "summarily rejected without opportunity for appeal.",
    ]
    c.setFont("Helvetica", 9)
    for line in col2_lines:
        if "Deadline" in line or "Channels" in line or "Warning" in line:
            c.setFont("Helvetica-Bold", 9)
        else:
            c.setFont("Helvetica", 9)
        c.drawString(col2_x, y2, line)
        y2 -= 14

    c.showPage()
    c.save()


def create_bilingual_pdf(output_path: Path) -> str:
    """Fixture 3: Bilingual notice (English + Hindi/Marathi) using Unicode font.

    Returns registered font name used.
    """
    font_name = register_unicode_font()

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )
    styles = getSampleStyleSheet()

    # Custom styles with Unicode font
    hi_title_style = ParagraphStyle(
        "HiTitle",
        parent=styles["Title"],
        fontName=font_name,
        fontSize=13,
        leading=17,
        alignment=1,
    )
    hi_body_style = ParagraphStyle(
        "HiBody",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=10,
        leading=14,
    )

    story = []

    # English + Devanagari Bilingual Notice
    story.append(Paragraph("<b>MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD.</b>", styles["Title"]))
    story.append(Paragraph("महाराष्ट्र राज्य विद्युत वितरण कंपनी मर्यादित", hi_title_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.darkblue, spaceAfter=12))

    story.append(Paragraph("<b>FINAL NOTICE FOR BILL PAYMENT & DISCONNECTION WARNING</b>", styles["Heading2"]))
    story.append(Paragraph("विद्युत देयक थकबाकी व वीज पुरवठा खंडित करण्याची अंतिम सूचना", hi_title_style))
    story.append(Spacer(1, 10))

    # Devanagari Paragraph
    story.append(Paragraph(
        "सर्व वीज ग्राहकांना कळविण्यात येते की आपल्या वीज बिलाची देय रक्कम रुपये 4500 थकबाकी आहे. "
        "सदर थकबाकी भरण्याची अंतिम दिनांक 20 नोव्हेंबर 2026 आहे. "
        "मुदतीत बिल न भरल्यास दिनांक 25 नोव्हेंबर 2026 रोजी वीज पुरवठा खंडित करण्यात येईल.",
        hi_body_style,
    ))
    story.append(Spacer(1, 10))

    # English Equivalent Paragraph
    story.append(Paragraph(
        "Notice is hereby served to all electricity consumers that outstanding electricity bill of Rs. 4,500 "
        "is overdue. The primary due date for bill payment is 20 November 2026. "
        "In case of non-payment by the due date, electricity supply will be disconnected on 25 November 2026. "
        "Reconnection fee of Rs. 500 will apply.",
        styles["Normal"],
    ))
    story.append(Spacer(1, 10))

    # Payment Steps and Options
    story.append(Paragraph(
        "<b>Payment Channels:</b> Customers may pay online via mahadiscom.in mobile application or at sub-division payment counters.",
        styles["Normal"],
    ))
    story.append(Paragraph(
        "ग्राहक महावितरण ॲप द्वारे किंवा उपविभाग कार्यालयात धनादेश अथवा ऑनलाइन भरणा करू शकतात.",
        hi_body_style,
    ))

    doc.build(story)
    return font_name


def create_repeated_footer_pdf(output_path: Path) -> None:
    """Fixture 4: Multi-page notice with repeated boilerplate footer."""
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=80,  # extra margin for footer
    )
    styles = getSampleStyleSheet()
    story = []

    pages_data = [
        (
            "CENTRAL SCHOLARSHIP MANAGEMENT PORTAL - CIRCULAR NO 14",
            "Part 1: General Notification & Scheme Overview",
            "The Ministry of Social Justice and Empowerment announces the opening of renewal cycle "
            "for National Higher Studies Scholarship Scheme for Academic Year 2026-27. "
            "All registered institutional coordinators are required to complete student verification dossiers. "
            "The primary submission deadline is 15 December 2026. Submissions must be uploaded via scholarship.gov.in.",
        ),
        (
            "CENTRAL SCHOLARSHIP MANAGEMENT PORTAL - CIRCULAR NO 14",
            "Part 2: Mandatory Documentation & Verification Protocol",
            "Institutional heads must verify the following required documents before endorsing renewals: "
            "1. Income Certificate issued by Revenue Authority 2. Previous Academic Marksheet 3. Bank Passbook copy. "
            "Optionally, a Bonafide Student Certificate is recommended but not mandatory.",
        ),
        (
            "CENTRAL SCHOLARSHIP MANAGEMENT PORTAL - CIRCULAR NO 14",
            "Part 3: Surcharges, Late Submission Window & Inquiries",
            "Institutions failing to submit by 15 December 2026 may submit during extended window until 30 December 2026 "
            "subject to an administrative late fee penalty of Rs. 1000 per institution. "
            "Direct inquiries to scholarship-support@gov.in or telephone helpline 011-23381234.",
        ),
    ]

    for idx, (title, heading, body) in enumerate(pages_data):
        story.append(Paragraph(f"<b>{title}</b>", styles["Title"]))
        story.append(Paragraph(f"<b>{heading}</b>", styles["Heading2"]))
        story.append(Spacer(1, 15))
        story.append(Paragraph(body, styles["Normal"]))
        story.append(Spacer(1, 30))
        if idx < len(pages_data) - 1:
            story.append(PageBreak())

    def draw_footer(canvas_obj: canvas.Canvas, doc_obj: Any) -> None:
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.setLineWidth(0.5)
        canvas_obj.line(54, 65, letter[0] - 54, 65)

        footer_line1 = (
            "CONFIDENTIAL & PROPRIETARY OFFICIAL COMMUNICATION - Issued pursuant to Statutory Regulations under Public Scheme Act. "
            "Unauthorized circulation prohibited."
        )
        footer_line2 = (
            f"National Informatics Centre (NIC) Server Audit ID: CSMP-2026-X89 | Toll-Free Helpdesk: 1800-111-9999 | Page {canvas_obj.getPageNumber()} of 3"
        )
        canvas_obj.drawString(54, 52, footer_line1)
        canvas_obj.drawString(54, 40, footer_line2)
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)


def create_twelve_page_pdf(output_path: Path) -> None:
    """Fixture 5: 12-page comprehensive circular document with substantial content per page."""
    c = canvas.Canvas(str(output_path), pagesize=letter)
    width, height = letter

    for page_num in range(1, 13):
        # Header
        c.setFont("Helvetica-Bold", 12)
        c.drawString(54, height - 50, "GOVERNMENT OF INDIA - MINISTRY OF RURAL DEVELOPMENT")
        c.setFont("Helvetica", 9)
        c.drawString(54, height - 65, f"Operational Circular RD/2026/788 - Page {page_num} of 12")
        c.setLineWidth(0.5)
        c.line(54, height - 72, width - 54, height - 72)

        y = height - 100

        if page_num == 1:
            c.setFont("Helvetica-Bold", 13)
            c.drawString(54, y, "NATIONAL RURAL INFRASTRUCTURE GRANT IMPLEMENTATION GUIDELINES 2026")
            y -= 25
            c.setFont("Helvetica-Bold", 10)
            c.drawString(54, y, "Main Purpose: Revised fund allocation and disbursement procedures for Gram Panchayats.")
            y -= 20
            c.setFont("Helvetica", 9)
            paragraphs = [
                "This comprehensive official notification lays down the operational framework for executing",
                "rural road, water supply, and electrification projects across all participating districts.",
                "All Gram Panchayat Development Officers and District Project Directors are required to",
                "strictly adhere to the timeline, procurement safeguards, and financial reporting benchmarks.",
                "",
                "Issuing Authority: Directorate of Rural Infrastructure, Krishi Bhavan, New Delhi.",
                "Designated Beneficiaries: All Panchayati Raj Institutions and accredited contractors.",
                "",
                "Submission Channel: All audit compliance dossiers and progress certificates must be submitted",
                "through the official national monitoring portal https://ruralinfras.gov.in.",
            ]
        elif page_num == 5:
            c.setFont("Helvetica-Bold", 11)
            c.drawString(54, y, "Section 5: Required Verification Documents and Checklist")
            y -= 20
            c.setFont("Helvetica", 9)
            paragraphs = [
                "Prior to fund disbursement for Phase 2 infrastructure works, the following required documents",
                "must be submitted by the executing engineer to the District Project Director:",
                "1. Soil Testing and Engineering Feasibility Report",
                "2. Gram Sabha Resolution and Approval Minute",
                "3. Verified Contractor Performance Guarantee Bond",
                "",
                "Optional Document: Geo-tagged drone site imagery is optional but recommended for fast-track processing.",
                "Ensure all documentation is duly countersigned by the Block Development Officer.",
            ]
        elif page_num == 9:
            c.setFont("Helvetica-Bold", 11)
            c.drawString(54, y, "Section 9: Calendar of Operations and Project Deadlines")
            y -= 20
            c.setFont("Helvetica", 9)
            paragraphs = [
                "Critical Schedule of Submission Dates for Fiscal Year 2026-27:",
                "Primary Deadline: All project completion reports must be submitted on or before 20 December 2026.",
                "Failure to submit by this date will result in freeze of central funding allocation.",
                "",
                "Extended Deadline: Submissions with special dispensation and penalty are accepted until 10 January 2027.",
                "Extended submissions are subject to a late audit fee of Rs. 5,000 per delayed project report.",
                "",
                "Consequence: If the primary deadline is missed, project sanction will be put on hold.",
            ]
        elif page_num == 12:
            c.setFont("Helvetica-Bold", 11)
            c.drawString(54, y, "Section 12: Regulatory Compliance, Penalties and Warnings")
            y -= 20
            c.setFont("Helvetica", 9)
            paragraphs = [
                "Compliance Warnings and Sanctions:",
                "Cash transactions are strictly prohibited under the Central Treasury Rules.",
                "Any non-compliance in procurement standards will invite criminal proceedings under Section 197.",
                "",
                "Notice Warning: Payments through unverified intermediary portals or third-party brokers are invalid.",
                "",
                "Action Steps for Project Completion Certification:",
                "1. Verify site completion with Block Development Officer.",
                "2. Upload audited expenditure reports to the national portal.",
                "3. Collect the central fund release certificate from the District Magistrate office.",
            ]
        else:
            c.setFont("Helvetica-Bold", 11)
            c.drawString(54, y, f"Section {page_num}: Administrative Protocols and Technical Annexure")
            y -= 20
            c.setFont("Helvetica", 9)
            paragraphs = [
                f"Detailed provisions for Phase {page_num} operations under the National Infrastructure Framework.",
                "Engineers and administrative staff must follow standard operating procedure 402/2026.",
                "Periodic quality audits will be conducted without prior intimation by the State Quality Monitors.",
                "All expenditure logs must reconcile with the Public Financial Management System (PFMS).",
                "Detailed equipment specifications and environmental impact criteria must be observed.",
                "Field inspections must be logged with GPS coordinates and photographic records.",
                "Quarterly review meetings will be chaired by the Principal Secretary at state headquarters.",
            ]

        # Fill with standard text to maintain realistic document size (~1500-2000 chars per page)
        filler = (
            "Government officers and project personnel must maintain high standards of probity and transparency. "
            "Any deviation from prescribed technical specifications or delays beyond scheduled completion dates "
            "will be reviewed by the standing technical oversight committee. All tender bids and work orders "
            "must comply with public procurement guidelines and e-tendering rules as amended from time to time. "
        )
        for _ in range(3):
            paragraphs.append(filler)

        for line in paragraphs:
            if y < 70:
                break
            c.drawString(54, y, line)
            y -= 14

        c.showPage()

    c.save()


def generate_all_phase7b_fixtures(fixtures_dir: Path | None = None) -> dict[str, Path]:
    """Generate all Phase 7b layout fixtures."""
    target_dir = fixtures_dir or (Path(__file__).resolve().parent)
    target_dir.mkdir(parents=True, exist_ok=True)

    fixtures = {
        "letterhead_table": target_dir / "letterhead_table.pdf",
        "two_column": target_dir / "two_column.pdf",
        "bilingual": target_dir / "bilingual.pdf",
        "repeated_footer": target_dir / "repeated_footer.pdf",
        "twelve_page": target_dir / "twelve_page.pdf",
    }

    create_letterhead_table_pdf(fixtures["letterhead_table"])
    create_two_column_pdf(fixtures["two_column"])
    create_bilingual_pdf(fixtures["bilingual"])
    create_repeated_footer_pdf(fixtures["repeated_footer"])
    create_twelve_page_pdf(fixtures["twelve_page"])

    return fixtures


if __name__ == "__main__":
    generated = generate_all_phase7b_fixtures()
    print("Generated Phase 7b fixtures:")
    for name, path in generated.items():
        print(f"  {name}: {path} ({path.stat().st_size} bytes)")
