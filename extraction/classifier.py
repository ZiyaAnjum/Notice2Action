"""Notice classification module for Notice to Action.

Provides a modular classification interface with a rule-based baseline
implementation using keyword and phrase scoring across the 5 canonical
notice categories:
- scholarship_or_college
- bank
- utility
- tax_or_payment
- government_scheme

Any unclassifiable, low-confidence, or ambiguous document is safely returned
as 'other_out_of_scope'.
"""

import re
from abc import ABC, abstractmethod
from typing import Any

from validation.validator import VALID_CATEGORIES, normalize_whitespace

# Minimum score threshold to consider a document within scope
MIN_SCORE_THRESHOLD = 3

# Ratio threshold: if runner-up score is within 75% of top score, treat as ambiguous
AMBIGUITY_RATIO_THRESHOLD = 0.75

# Category keyword and phrase signals with weighted scoring
CATEGORY_SIGNALS: dict[str, dict[str, Any]] = {
    "scholarship_or_college": {
        "phrases": [
            "post-graduate merit scholarship",
            "merit scholarship",
            "scholarship renewal",
            "tuition fee",
            "academic year",
            "semester marksheet",
            "bonafide certificate",
            "admit card",
            "college principal",
            "university registrar",
            "examination fee",
            "hostel fee",
            "merit-cum-means",
            "financial aid cell",
            "higher education directorate",
            "scholarship cell",
            "student portal",
            "attendance certificate",
            "exam registration",
        ],
        "keywords_strong": [
            "scholarship",
            "scholarships",
            "matriculation",
            "semester",
            "tuition",
            "hallticket",
            "bonafide",
            "fellowship",
            "stipend",
            "coursework",
        ],
        "keywords_domain": [
            "student",
            "students",
            "college",
            "university",
            "degree",
            "admit",
            "attendance",
            "academic",
            "faculty",
            "campus",
        ],
    },
    "bank": {
        "phrases": [
            "reserve bank of india",
            "bank account",
            "saving bank",
            "current account",
            "fixed deposit",
            "kyc compliance",
            "re-kyc verification",
            "branch manager",
            "dormant account",
            "loan overdue",
            "emi overdue",
            "equated monthly installment",
            "ifsc code",
            "debit card",
            "credit card",
            "pan card copy",
            "aadhaar card copy",
            "bank statement",
            "banking ombudsman",
            "cibil score",
        ],
        "keywords_strong": [
            "ifsc",
            "kyc",
            "emi",
            "overdue",
            "cheque",
            "passbook",
            "overdraft",
            "neft",
            "rtgs",
            "imps",
            "banker",
        ],
        "keywords_domain": [
            "bank",
            "banks",
            "banking",
            "account",
            "accounts",
            "branch",
            "loan",
            "deposit",
            "debit",
            "credit",
            "borrower",
            "lender",
        ],
    },
    "utility": {
        "phrases": [
            "electricity bill",
            "water bill",
            "disconnection notice",
            "power supply",
            "units consumed",
            "meter reading",
            "meter number",
            "tariff category",
            "energy charges",
            "water supply",
            "pipeline connection",
            "consumer number",
            "substation",
            "electricity board",
            "water sewerage board",
            "notice of disconnection",
            "immediate disconnection",
        ],
        "keywords_strong": [
            "kwh",
            "kilowatt",
            "disconnection",
            "tariff",
            "sewerage",
            "substation",
            "piped",
            "reconnection",
        ],
        "keywords_domain": [
            "electricity",
            "power",
            "meter",
            "water",
            "utility",
            "utilities",
            "voltage",
            "feeder",
            "pipeline",
            "grid",
        ],
    },
    "tax_or_payment": {
        "phrases": [
            "property tax",
            "income tax",
            "demand notice",
            "assessment year",
            "tax return",
            "revenue department",
            "challan",
            "section 143",
            "tax demand",
            "taxpayer identification",
            "assesse",
            "advance tax",
            "municipal corporation tax",
            "outstanding dues",
            "tax arrears",
            "notice of demand",
            "late payment penalty",
        ],
        "keywords_strong": [
            "challan",
            "assesse",
            "taxpayer",
            "assessment",
            "arrears",
            "cess",
            "surcharge",
            "statutory",
        ],
        "keywords_domain": [
            "tax",
            "taxes",
            "revenue",
            "municipal",
            "dues",
            "levy",
            "penalty",
            "penalties",
            "payable",
            "treasury",
        ],
    },
    "government_scheme": {
        "phrases": [
            "pm kisan",
            "samman nidhi",
            "direct benefit transfer",
            "government scheme",
            "welfare scheme",
            "ration card",
            "subsidy disbursement",
            "beneficiary list",
            "gram panchayat",
            "widow pension",
            "old age pension",
            "bpl family",
            "below poverty line",
            "social welfare department",
            "empowerment ministry",
            "financial assistance scheme",
            "yojana",
        ],
        "keywords_strong": [
            "yojana",
            "subsidy",
            "subsidies",
            "beneficiary",
            "beneficiaries",
            "dbt",
            "pension",
            "panchayat",
            "welfare",
        ],
        "keywords_domain": [
            "scheme",
            "schemes",
            "ministry",
            "directorate",
            "assistance",
            "entitlement",
            "citizen",
            "grant",
            "relief",
        ],
    },
}


class BaseClassifier(ABC):
    """Abstract base class for document classifiers, enabling easy LLM swapping in Phase 3."""

    @abstractmethod
    def classify(self, text: str) -> dict[str, Any]:
        """Classify notice text into category, confidence, and matched signals.

        Args:
            text: Plain text extracted from document pages.

        Returns:
            Dict containing {category, confidence, matched_signals}.
        """
        pass


class RuleBasedClassifier(BaseClassifier):
    """Rule-based keyword and phrase scoring classifier.

    Evaluates text against curated dictionaries of domain phrases and keywords.
    Never forces a guess: safely returns 'other_out_of_scope' when score is below
    threshold or top scores are ambiguously close.
    """

    def __init__(
        self,
        score_threshold: int = MIN_SCORE_THRESHOLD,
        ambiguity_ratio: float = AMBIGUITY_RATIO_THRESHOLD,
    ) -> None:
        self.score_threshold = score_threshold
        self.ambiguity_ratio = ambiguity_ratio

    def classify(self, text: str) -> dict[str, Any]:
        """Score text against canonical categories and return classification result."""
        clean_text = normalize_whitespace(text).lower()

        if not clean_text or len(clean_text) < 10:
            return {
                "category": "other_out_of_scope",
                "confidence": 0.0,
                "matched_signals": [],
            }

        scores: dict[str, int] = {}
        signals: dict[str, list[str]] = {}

        for category, rules in CATEGORY_SIGNALS.items():
            cat_score = 0
            cat_signals: list[str] = []

            # 1. Match multi-word phrases (weight 3)
            for phrase in rules["phrases"]:
                if phrase in clean_text:
                    cat_score += 3
                    cat_signals.append(phrase)

            # 2. Match strong keywords with word boundary (weight 2)
            for word in rules["keywords_strong"]:
                if re.search(rf"\b{re.escape(word)}\b", clean_text):
                    cat_score += 2
                    if word not in cat_signals:
                        cat_signals.append(word)

            # 3. Match general domain keywords with word boundary (weight 1)
            for word in rules["keywords_domain"]:
                if re.search(rf"\b{re.escape(word)}\b", clean_text):
                    cat_score += 1
                    if word not in cat_signals:
                        cat_signals.append(word)

            scores[category] = cat_score
            signals[category] = cat_signals

        # Sort categories by descending score
        sorted_cats = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        top_cat, top_score = sorted_cats[0]
        runner_up_cat, runner_up_score = sorted_cats[1]

        # Case 1: Low score - below threshold
        if top_score < self.score_threshold:
            return {
                "category": "other_out_of_scope",
                "confidence": 0.0,
                "matched_signals": [],
            }

        # Case 2: Ambiguous tie - top two categories are too close
        score_diff = top_score - runner_up_score
        is_ambiguous = runner_up_score >= self.score_threshold and (
            (runner_up_score / top_score) >= self.ambiguity_ratio or score_diff <= 3
        )
        if is_ambiguous:
            return {
                "category": "other_out_of_scope",
                "confidence": 0.30,
                "matched_signals": [
                    f"ambiguous_conflict: {top_cat} ({top_score}) vs {runner_up_cat} ({runner_up_score})"
                ],
            }

        # Case 3: Clear category winner
        # Calculate confidence smoothly between 0.70 and 0.98
        score_diff = top_score - runner_up_score
        confidence = 0.70 + min(0.28, (score_diff * 0.04) + min(top_score, 12) * 0.015)
        confidence = round(min(0.98, max(0.60, confidence)), 2)

        return {
            "category": top_cat,
            "confidence": confidence,
            "matched_signals": signals[top_cat],
        }


# Global default classifier instance
_default_classifier = RuleBasedClassifier()


def get_classifier() -> BaseClassifier:
    """Retrieve the current default classifier instance."""
    return _default_classifier


def classify_notice(
    content: str | list[dict[str, Any]],
    classifier: BaseClassifier | None = None,
) -> dict[str, Any]:
    """Classify notice content into a canonical category.

    Args:
        content: Extracted text string or list of page dicts from extract_pages.
        classifier: Optional classifier implementation. Defaults to RuleBasedClassifier.

    Returns:
        Dictionary conforming to {category, confidence, matched_signals}.
    """
    if isinstance(content, list):
        # Concatenate text from readable pages
        text = " ".join(page.get("text", "") for page in content if isinstance(page, dict))
    else:
        text = str(content)

    clf = classifier or get_classifier()
    result = clf.classify(text)

    # Validate output category against canonical schema enum
    if result["category"] not in VALID_CATEGORIES:
        result["category"] = "other_out_of_scope"
        result["confidence"] = 0.0

    return result
