import copy
import json
from pathlib import Path

from validation.validator import validate_notice


def test_validate_notice_passes_on_sample_notice() -> None:
    """Verify validation passes on sample_notice.json."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    sample_file = repo_root / "schema" / "sample_notice.json"

    with open(sample_file, encoding="utf-8") as f:
        sample = json.load(f)

    # Provide synthetic page text containing the exact quotes
    page_texts = [
        "Sub: Post-Graduate Merit Scholarship 2026-27 Renewal & Verification Notice. "
        "ISSUED BY: State Higher Education Directorate, Scholarship Cell. "
        "All eligible scholars are hereby instructed to submit semester renewal dossiers online on or before 15-11-2026 to avoid disbursement suspension. "
        "Target Beneficiaries: All registered awardees under PG Merit Scheme 2025-27. "
        "last date for online upload on the state scholarship portal is 15-11-2026 up to 5:00 PM IST. "
        "Self-attested copy of Semester II Official Marksheet is mandatory. "
        "Institution head signed certificate certifying minimum 75% attendance. "
        "Step 1: Obtain signed attendance certificate from Head of Department. "
        "Step 2: Log in to portal https://scholarships.state.gov.in and click Renewal 2026. "
        "Submissions will be accepted exclusively via state portal https://scholarships.state.gov.in",
        "Principals must countersign uploaded forms within 7 working days from portal closing. "
        "Hostel residents may attach fee receipt for consideration of additional accommodation stipend (optional). "
        "Step 3: Upload PDF copies of Semester II marksheet and attendance certificate. "
        "Step 4: Submit physical printout of submitted acknowledgment to College Nodal Officer. "
        "Failure to submit by stipulated date shall result in forfeiture of scholarship for subsequent quarters. "
        "within 7 working days from portal closing",
    ]

    report = validate_notice(sample, page_texts)
    assert report["is_valid"] is True
    assert report["schema_compliant"] is True
    assert report["grounded_ratio"] == 1.0
    assert len(report["errors"]) == 0


def test_validate_notice_detects_missing_keys() -> None:
    """Verify validation fails on empty or missing keys."""
    report = validate_notice({})
    assert report["is_valid"] is False
    assert len(report["errors"]) > 0


def test_validate_notice_marks_unverified_quote_as_uncertain() -> None:
    """Verify unverified evidence quotes mark the item status as 'uncertain' and emit a warning."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    sample_file = repo_root / "schema" / "sample_notice.json"

    with open(sample_file, encoding="utf-8") as f:
        notice = json.load(f)

    # Modify title evidence quote so it cannot be found on page 1
    notice["title"]["evidence"]["quote"] = "Non-existent fabricated heading not in notice"
    notice["title"]["status"] = "found"

    page_texts = ["Completely different document text on page 1.", "Page 2 text."]

    report = validate_notice(notice, page_texts)
    # Status should be demoted to uncertain per reliability rules
    assert notice["title"]["status"] == "uncertain"
    assert report["grounded_ratio"] < 1.0
    assert any("Grounding warning" in w for w in report["warnings"])


def test_validate_notice_handles_whitespace_and_curly_quotes() -> None:
    """Verify quote matching normalizes newlines and curly quotation marks."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    sample_file = repo_root / "schema" / "sample_notice.json"

    with open(sample_file, encoding="utf-8") as f:
        notice = json.load(f)

    # Use curly quotes and newlines in quote
    notice_copy = copy.deepcopy(notice)
    notice_copy["deadlines"][0]["evidence"]["quote"] = (
        "last date for online upload\n   on the state scholarship portal is 15-11-2026 up to 5:00 PM IST"
    )

    page_texts = [
        "Header text. “last date for online upload on the state scholarship portal is 15-11-2026 up to 5:00 PM IST” end text.",
        "Page 2.",
    ]

    report = validate_notice(notice_copy, page_texts)
    # The normalized quote should successfully match despite newlines/curly quotes
    assert any("deadline: Online Portal Submission Deadline" not in w for w in report["warnings"])


def test_validate_notice_handles_none_array_fields() -> None:
    """Verify notice with None array fields is safely handled without throwing TypeError."""
    malformed_notice = {
        "notice_id": "test-none-fields",
        "category": "scholarship",
        "deadlines": None,
        "required_documents": None,
        "action_steps": None,
        "fees_penalties": None,
    }
    report = validate_notice(malformed_notice, ["Some text"])
    assert report["is_valid"] is False  # Schema error due to null arrays
    assert isinstance(report["errors"], list)
