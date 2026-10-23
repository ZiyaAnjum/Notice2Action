"""Unit tests for notice classification module."""

from pathlib import Path
from typing import Any

from extraction.classifier import (
    BaseClassifier,
    classify_notice,
)
from extraction.extractor import extract_pages

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"


def test_classify_scholarship_fixture() -> None:
    """Verify scholarship_or_college fixture is correctly classified."""
    pdf_path = FIXTURES_DIR / "scholarship_or_college.pdf"
    pages = extract_pages(pdf_path)
    result = classify_notice(pages)

    assert result["category"] == "scholarship_or_college"
    assert result["confidence"] >= 0.75
    assert len(result["matched_signals"]) > 0


def test_classify_bank_fixture() -> None:
    """Verify bank notice fixture is correctly classified."""
    pdf_path = FIXTURES_DIR / "bank.pdf"
    pages = extract_pages(pdf_path)
    result = classify_notice(pages)

    assert result["category"] == "bank"
    assert result["confidence"] >= 0.75
    assert len(result["matched_signals"]) > 0


def test_classify_utility_fixture() -> None:
    """Verify utility notice fixture is correctly classified."""
    pdf_path = FIXTURES_DIR / "utility.pdf"
    pages = extract_pages(pdf_path)
    result = classify_notice(pages)

    assert result["category"] == "utility"
    assert result["confidence"] >= 0.75
    assert len(result["matched_signals"]) > 0


def test_classify_tax_fixture() -> None:
    """Verify tax demand notice fixture is correctly classified."""
    pdf_path = FIXTURES_DIR / "tax_or_payment.pdf"
    pages = extract_pages(pdf_path)
    result = classify_notice(pages)

    assert result["category"] == "tax_or_payment"
    assert result["confidence"] >= 0.75
    assert len(result["matched_signals"]) > 0


def test_classify_government_scheme_fixture() -> None:
    """Verify government welfare scheme notice fixture is correctly classified."""
    pdf_path = FIXTURES_DIR / "government_scheme.pdf"
    pages = extract_pages(pdf_path)
    result = classify_notice(pages)

    assert result["category"] == "government_scheme"
    assert result["confidence"] >= 0.75
    assert len(result["matched_signals"]) > 0


def test_classify_recipe_out_of_scope() -> None:
    """Verify unrelated recipe document is classified as other_out_of_scope."""
    pdf_path = FIXTURES_DIR / "recipe_unrelated.pdf"
    pages = extract_pages(pdf_path)
    result = classify_notice(pages)

    assert result["category"] == "other_out_of_scope"
    assert result["confidence"] == 0.0
    assert result["matched_signals"] == []


def test_classify_ambiguous_conflict_returns_out_of_scope() -> None:
    """Verify conflicting signals between two categories return out_of_scope."""
    # Balanced text matching both bank and utility evenly
    ambiguous_text = (
        "Notice to Consumer: Your electricity board electricity bill and power supply disconnection notice "
        "is linked to your bank account and saving bank fixed deposit. Please submit "
        "bank statement and meter reading to avoid loan overdue and electricity disconnection."
    )
    result = classify_notice(ambiguous_text)

    # Must not force a guess
    assert result["category"] == "other_out_of_scope"
    assert result["confidence"] <= 0.35
    assert any("ambiguous" in sig for sig in result["matched_signals"])


def test_classify_empty_and_short_text() -> None:
    """Verify empty or short text returns other_out_of_scope without error."""
    assert classify_notice("")["category"] == "other_out_of_scope"
    assert classify_notice("hello")["category"] == "other_out_of_scope"
    assert classify_notice([])["category"] == "other_out_of_scope"


def test_classifier_swappability_interface() -> None:
    """Verify that a custom BaseClassifier implementation can be swapped in."""

    class MockLLMClassifier(BaseClassifier):
        def classify(self, text: str) -> dict[str, Any]:
            return {
                "category": "tax_or_payment",
                "confidence": 0.99,
                "matched_signals": ["llm_verified_tax_intent"],
            }

    custom_clf = MockLLMClassifier()
    result = classify_notice("any arbitrary prompt text", classifier=custom_clf)

    assert result["category"] == "tax_or_payment"
    assert result["confidence"] == 0.99
    assert result["matched_signals"] == ["llm_verified_tax_intent"]
