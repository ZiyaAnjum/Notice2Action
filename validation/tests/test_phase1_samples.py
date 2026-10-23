import json
from pathlib import Path

import jsonschema
import pytest

from validation.validator import SCHEMA_PATH, VALID_CATEGORIES, validate_notice

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLES_DIR = REPO_ROOT / "samples"
SCHEMA_FILE = REPO_ROOT / "schemas" / "notice_output.schema.json"

SAMPLE_FILES = [
    SAMPLES_DIR / "tax_demand_notice.json",
    SAMPLES_DIR / "utility_disconnection_notice.json",
    SAMPLES_DIR / "scholarship_renewal_notice.json",
    SAMPLES_DIR / "bank_kyc_update_notice.json",
]


def test_schema_file_exists_and_is_valid() -> None:
    """Verify that schemas/notice_output.schema.json exists and is valid Draft 2020-12 schema."""
    assert SCHEMA_FILE.exists(), f"Schema file not found at: {SCHEMA_FILE}"
    assert SCHEMA_PATH == SCHEMA_FILE

    with open(SCHEMA_FILE, encoding="utf-8") as f:
        schema_dict = json.load(f)

    # Validates that the schema itself conforms to Draft 2020-12 meta-schema
    jsonschema.Draft202012Validator.check_schema(schema_dict)

    expected_categories = [
        "scholarship_or_college",
        "bank",
        "utility",
        "tax_or_payment",
        "government_scheme",
        "other_out_of_scope",
    ]
    assert schema_dict["$defs"]["CategoryEnum"]["enum"] == expected_categories
    assert list(VALID_CATEGORIES) == expected_categories


@pytest.mark.parametrize("sample_path", SAMPLE_FILES)
def test_sample_notice_validates_against_schema(sample_path: Path) -> None:
    """Verify each sample notice exists and passes validate_notice with zero errors."""
    assert sample_path.exists(), f"Sample notice not found at: {sample_path}"

    with open(sample_path, encoding="utf-8") as f:
        notice_data = json.load(f)

    report = validate_notice(notice_data)
    assert report["is_valid"] is True, f"Errors in {sample_path.name}: {report['errors']}"
    assert report["schema_compliant"] is True
    assert len(report["errors"]) == 0

    # Verify required contract fields
    for required_key in [
        "category",
        "notice_title",
        "issuing_organisation",
        "affected_party",
        "main_purpose",
        "plain_language_summary",
        "deadlines",
        "required_documents",
        "submission_channel",
        "penalties",
        "action_steps",
        "warnings",
        "needs_verification",
    ]:
        assert required_key in notice_data, f"Missing key '{required_key}' in {sample_path.name}"


def test_samples_cover_distinct_prd_categories() -> None:
    """Verify that the 4 samples cover distinct PRD categories."""
    categories: list[str] = []
    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)
            categories.append(data["category"])

    assert len(set(categories)) == 4
    expected_categories = {"scholarship_or_college", "bank", "utility", "tax_or_payment"}
    assert set(categories) == expected_categories


def test_top_level_evidence_fields() -> None:
    """Verify top-level fields carry text, evidence_quote, and source_page across all samples."""
    top_fields = ["notice_title", "issuing_organisation", "affected_party", "main_purpose"]

    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)

        for field in top_fields:
            assert field in data, f"Missing top-level field '{field}' in {sample_path.name}"
            field_data = data[field]
            assert isinstance(field_data, dict)
            assert "text" in field_data or "value" in field_data
            assert "evidence_quote" in field_data
            assert "source_page" in field_data


def test_plain_language_summary_five_parts() -> None:
    """Verify plain_language_summary contains all 5 required sub-sections."""
    sub_parts = [
        "what_is_this",
        "why_it_matters",
        "what_to_do",
        "where_to_do_it",
        "if_deadline_missed",
    ]

    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)

        summary = data["plain_language_summary"]
        assert isinstance(summary, dict)
        for part in sub_parts:
            assert part in summary, f"Missing '{part}' in summary for {sample_path.name}"
            assert summary[part] is not None


def test_required_documents_is_required_flag() -> None:
    """Verify required_documents items have boolean is_required flag."""
    allowed_statuses = {"not_completed", "completed", "needs_verification"}

    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)

        for doc in data["required_documents"]:
            assert "name" in doc
            assert "is_required" in doc
            assert isinstance(doc["is_required"], bool)
            assert "evidence_quote" in doc
            assert "source_page" in doc
            assert doc["status"] in allowed_statuses


def test_deadlines_ambiguity_flag() -> None:
    """Verify deadlines items contain is_ambiguous_or_conflicting boolean and reason."""
    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)

        for item in data["deadlines"]:
            assert "date" in item
            assert "description" in item
            assert "evidence_quote" in item
            assert "source_page" in item
            assert "confidence" in item
            assert "is_ambiguous_or_conflicting" in item
            assert isinstance(item["is_ambiguous_or_conflicting"], bool)
            if item["is_ambiguous_or_conflicting"]:
                assert "ambiguity_reason" in item
                assert item["ambiguity_reason"] is not None


def test_warnings_array() -> None:
    """Verify warnings array items carry warning_text, evidence_quote, and source_page."""
    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)

        warnings = data["warnings"]
        assert isinstance(warnings, list)
        for w in warnings:
            assert "warning_text" in w or "message" in w
            assert "evidence_quote" in w
            assert "source_page" in w


def test_bank_sample_specifics() -> None:
    """Verify bank KYC sample output meets banking domain specifications."""
    bank_sample_path = SAMPLES_DIR / "bank_kyc_update_notice.json"
    with open(bank_sample_path, encoding="utf-8") as f:
        data = json.load(f)

    assert data["category"] == "bank"
    assert "re-kyc" in data["main_purpose"]["text"].lower()
    assert any("pan" in doc["name"].lower() for doc in data["required_documents"])
    assert any("debit" in p["description"].lower() for p in data["penalties"])

    # Provide synthetic page text containing exact bank notice quotes
    page_texts = [
        "Subject: Periodic KYC Updation Mandate for Account No. 4092187342. "
        "Issued by: Apex National Bank Ltd., Central Retail Banking Division. "
        "Dear Customer, Account No: 4092187342, Branch: Connaught Place. "
        "You are requested to submit fresh KYC documents within 30 days of this circular to prevent temporary debit restriction. "
        "All KYC documents must be verified and updated on or before 15-12-2026. "
        "Self-attested photocopy of any Officially Valid Document (OVD) is mandatory for address re-verification. "
        "Copy of PAN card or signed Form 60 declaration must be tendered. "
        "Customers may verify via Video-KYC at https://netbanking.apexbank.com/re-kyc or at any home branch. "
        "Step 1: Access Video-KYC portal at https://netbanking.apexbank.com/re-kyc or visit your nearest home branch. ",
        "One recent passport size color photograph taken within the last 3 months. "
        "Customer may present original passbook if updating recorded signature style (optional). "
        "Account will be subjected to total debit freeze preventing all automated clearing and ATM withdrawals. "
        "Subsequent failure will classify account as inoperative per regulatory norms. "
        "Step 2: Submit self-attested photocopies of Aadhaar and PAN along with signed Re-KYC declaration form. "
        "Step 3: Verify mobile OTP and obtain branch acknowledgment receipt or digital tracking service ticket. "
        "Bank officials never request passwords, card PINs or OTPs under the guise of KYC updating. ",
    ]

    report = validate_notice(data, page_texts)
    assert report["is_valid"] is True
    assert report["schema_compliant"] is True
    assert report["grounded_ratio"] == 1.0
    assert report["quotes_checked"] > 0
    assert report["quotes_verified"] == report["quotes_checked"]
    assert len(report["errors"]) == 0
