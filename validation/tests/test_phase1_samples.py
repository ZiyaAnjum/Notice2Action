import json
from pathlib import Path

import jsonschema
import pytest

from validation.validator import SCHEMA_PATH, validate_notice

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLES_DIR = REPO_ROOT / "samples"
SCHEMA_FILE = REPO_ROOT / "schemas" / "notice_output.schema.json"

SAMPLE_FILES = [
    SAMPLES_DIR / "tax_demand_notice.json",
    SAMPLES_DIR / "utility_disconnection_notice.json",
    SAMPLES_DIR / "education_exam_registration.json",
]


def test_schema_file_exists_and_is_valid() -> None:
    """Verify that schemas/notice_output.schema.json exists and is valid Draft 2020-12 schema."""
    assert SCHEMA_FILE.exists(), f"Schema file not found at: {SCHEMA_FILE}"
    assert SCHEMA_PATH == SCHEMA_FILE

    with open(SCHEMA_FILE, encoding="utf-8") as f:
        schema_dict = json.load(f)

    # Validates that the schema itself conforms to Draft 2020-12 meta-schema
    jsonschema.Draft202012Validator.check_schema(schema_dict)
    assert schema_dict["properties"]["category"]["enum"] == [
        "tax_or_revenue",
        "utility_or_billing",
        "legal_or_court",
        "education_or_exam",
        "government_benefit_or_welfare",
        "other_out_of_scope",
    ]


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
        "plain_language_summary",
        "deadlines",
        "required_documents",
        "submission_channel",
        "penalties",
        "action_steps",
        "needs_verification",
    ]:
        assert required_key in notice_data, f"Missing key '{required_key}' in {sample_path.name}"


def test_three_samples_cover_distinct_categories() -> None:
    """Verify that the 3 samples cover distinct MVP categories."""
    categories: list[str] = []
    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)
            categories.append(data["category"])

    assert len(set(categories)) == 3
    for cat in categories:
        assert cat in [
            "tax_or_revenue",
            "utility_or_billing",
            "legal_or_court",
            "education_or_exam",
            "government_benefit_or_welfare",
            "other_out_of_scope",
        ]


def test_sample_required_documents_contract() -> None:
    """Verify required_documents status enum and evidence fields across all samples."""
    allowed_statuses = {"not_completed", "completed", "needs_verification"}

    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)

        for doc in data["required_documents"]:
            assert "name" in doc
            assert "evidence_quote" in doc
            assert "source_page" in doc
            assert doc["status"] in allowed_statuses, (
                f"Unexpected doc status '{doc['status']}' in {sample_path.name}"
            )


def test_sample_deadlines_contract() -> None:
    """Verify deadlines item structure contains date, description, quote, page, confidence."""
    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)

        for item in data["deadlines"]:
            assert "date" in item
            assert "description" in item
            assert "evidence_quote" in item
            assert "source_page" in item
            assert "confidence" in item


def test_sample_action_steps_ordered() -> None:
    """Verify action_steps are sequentially ordered starting at 1."""
    for sample_path in SAMPLE_FILES:
        with open(sample_path, encoding="utf-8") as f:
            data = json.load(f)

        steps = data["action_steps"]
        assert len(steps) > 0
        orders = [s["order"] for s in steps]
        assert orders == list(range(1, len(steps) + 1))


def test_evidence_grounding_on_tax_sample() -> None:
    """Verify evidence quote verification succeeds when matching page texts are provided."""
    tax_sample_path = SAMPLES_DIR / "tax_demand_notice.json"
    with open(tax_sample_path, encoding="utf-8") as f:
        data = json.load(f)

    page_texts = [
        "Directorate of Municipal Revenue. "
        "All assessees are required to clear property tax dues for FY 2026-27 by 30-11-2026 failing which recovery actions shall commence. "
        "Payment must be completed on or before 30th November 2026 to avoid penal interest. "
        "An early payment rebate of 5% is applicable if payment is recorded by 31-10-2026. "
        "Tax may be remitted online at https://propertytax.citygov.in/portal or in-person at Citizen Service Centers. "
        "Step 1: Assessees should log in with their 10-digit PID to inspect tax liability details. ",
        "Photocopy of previous financial year tax clearance receipt is compulsory for verification. "
        "Original PID smart card or system generated PID slip must be cited. "
        "Owners of newly constructed floors may submit completion certificate to claim revised assessment (optional). "
        "A simple interest penalty of 2% per month on defaulted tax will be added after 30-11-2026. "
        "Non-payment exceeding 90 days may result in attachment of movable property and disconnection of water connection. "
        "Step 2: Submit self-assessment declaration with previous receipt attached. "
        "Step 3: Complete payment through authorized payment gateway or generate bank challan. ",
    ]

    report = validate_notice(data, page_texts)
    assert report["is_valid"] is True
    assert report["grounded_ratio"] == 1.0
    assert report["quotes_checked"] > 0
    assert report["quotes_verified"] == report["quotes_checked"]
    assert len(report["warnings"]) == 0
