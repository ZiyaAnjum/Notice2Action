"""Targeted tests for multilingual simple summary generation, templates, and endpoint."""

from __future__ import annotations

import pytest
from backend.app.services.summary_service import (
    GENERIC_PHRASE_BLOCKLIST,
    build_template_summary,
    extract_verified_facts,
    format_date_for_lang,
    generate_multilingual_summary,
    validate_summary_field,
)


def test_format_date_for_lang():
    assert format_date_for_lang("2026-11-18", "en") == "18 Nov 2026"
    assert format_date_for_lang("2026-11-18", "hi") == "18 नवंबर 2026"
    assert format_date_for_lang("2026-11-18", "kn") == "18 ನವೆಂಬರ್ 2026"


def test_electricity_notice_summary_en_hi_kn():
    result_json = {
        "notice_date": "2026-11-03",
        "headline": {
            "source_organisation": "Sunrise Power Distribution Company Ltd.",
            "notice_type": "electricity bill",
            "amount_due": {"amount": 4860.0, "currency": "INR"},
        },
        "deadlines": [
            {"id": "dl-1", "label": "Payment without surcharge", "date": "2026-11-18", "urgency": "fixed"},
            {"id": "dl-2", "label": "Payment with late surcharge", "date": "2026-11-20", "urgency": "fixed"},
        ],
        "action_steps": [
            {"order": 1, "text": "Pay online at portal", "group_title": "Pay the bill"},
        ],
        "consequences": [
            {"label": "Disconnection", "value": "Power supply may be disconnected within 7 days of due date"},
        ],
    }

    # English
    en_sum = generate_multilingual_summary(result_json, lang="en")
    assert "Sunrise Power Distribution Company Ltd." in en_sum["what_is_this"]
    assert "₹4,860" in en_sum["what_to_do"]
    assert "18 Nov 2026" in en_sum["by_when"]
    assert "disconnected" in en_sum["if_you_ignore"].lower() or "power" in en_sum["if_you_ignore"].lower()

    # Hindi
    hi_sum = generate_multilingual_summary(result_json, lang="hi")
    assert "Sunrise Power Distribution Company Ltd." in hi_sum["what_is_this"]
    assert "₹4,860" in hi_sum["what_to_do"]
    assert "18 नवंबर 2026" in hi_sum["by_when"]
    assert "बिजली" in hi_sum["if_you_ignore"] or "काटी" in hi_sum["if_you_ignore"]

    # Kannada
    kn_sum = generate_multilingual_summary(result_json, lang="kn")
    assert "Sunrise Power Distribution Company Ltd." in kn_sum["what_is_this"]
    assert "₹4,860" in kn_sum["what_to_do"]
    assert "18 ನವೆಂಬರ್ 2026" in kn_sum["by_when"]
    assert "ವಿದ್ಯುತ್" in kn_sum["if_you_ignore"] or "ಕಡಿತ" in kn_sum["if_you_ignore"]


def test_kyc_notice_summary_en_hi_kn():
    result_json = {
        "notice_date": "2026-11-01",
        "headline": {
            "source_organisation": "Riverside Cooperative Bank",
            "notice_type": "KYC update",
            "amount_due": None,  # No amount
        },
        "deadlines": [
            {"id": "dl-1", "label": "KYC submission", "date": None, "urgency": "asap", "date_rule_text": "At the earliest"},
        ],
        "action_steps": [
            {"order": 1, "text": "Submit one identity proof and one address proof", "group_title": "KYC documents submission"},
        ],
        "required_documents": [
            {"name": "one identity proof and one address proof"},
        ],
        "consequences": [
            {"label": "Account restriction", "value": "Restrictions on debit transactions"},
        ],
    }

    # English
    en_sum = generate_multilingual_summary(result_json, lang="en")
    assert "Riverside Cooperative Bank" in en_sum["what_is_this"]
    assert "₹" not in en_sum["what_to_do"]  # Null amount must NOT be mentioned!
    assert "one identity proof and one address proof" in en_sum["what_to_do"]
    # Must NOT hallucinate Aadhaar, PAN, freeze, or withdrawal
    assert "Aadhaar" not in en_sum["what_to_do"]
    assert "PAN" not in en_sum["what_to_do"]
    assert "freeze" not in en_sum["if_you_ignore"].lower()
    assert "withdrawal" not in en_sum["if_you_ignore"].lower()
    assert "restrictions on debit transactions" in en_sum["if_you_ignore"].lower()
    assert "No fixed date" in en_sum["by_when"] or "as soon as possible" in en_sum["by_when"].lower()

    # Hindi
    hi_sum = generate_multilingual_summary(result_json, lang="hi")
    assert "Riverside Cooperative Bank" in hi_sum["what_is_this"]
    assert "₹" not in hi_sum["what_to_do"]
    assert "Aadhaar" not in hi_sum["what_to_do"] and "आधार" not in hi_sum["what_to_do"]
    assert "PAN" not in hi_sum["what_to_do"] and "पैन" not in hi_sum["what_to_do"]
    assert "फ्रीज" not in hi_sum["if_you_ignore"]
    assert "निकासी" not in hi_sum["if_you_ignore"]
    assert "प्रतिबंध" in hi_sum["if_you_ignore"] or "restrictions on debit transactions" in hi_sum["if_you_ignore"]

    # Kannada
    kn_sum = generate_multilingual_summary(result_json, lang="kn")
    assert "Riverside Cooperative Bank" in kn_sum["what_is_this"]
    assert "₹" not in kn_sum["what_to_do"]
    assert "Aadhaar" not in kn_sum["what_to_do"] and "ಆಧಾರ್" not in kn_sum["what_to_do"]
    assert "PAN" not in kn_sum["what_to_do"] and "ಪ್ಯಾನ್" not in kn_sum["what_to_do"]
    assert "ಸ್ಥಗಿತ" not in kn_sum["if_you_ignore"]
    assert "ಹಿಂಪಡೆಯುವಿಕೆ" not in kn_sum["if_you_ignore"]
    assert "ನಿರ್ಬಂಧ" in kn_sum["if_you_ignore"] or "restrictions on debit transactions" in kn_sum["if_you_ignore"]


def test_validation_rejects_hallucinations_and_generic_phrases():
    facts = {
        "organisation": "Riverside Cooperative Bank",
        "notice_type": "KYC update",
        "notice_date": "2026-11-01",
        "amount": None,
        "deadlines": [],
        "task_groups": ["KYC submission"],
        "required_documents": ["one identity proof and one address proof"],
        "consequences": ["Restrictions on debit transactions"],
    }

    # 1. Generic blocked phrases must be rejected
    assert not validate_summary_field("Review the notice instructions and complete the required tasks", "what_to_do", facts)
    assert not validate_summary_field("Check timeline below for specific due dates", "by_when", facts)
    assert not validate_summary_field("Late fees, penalties, or service disruptions may apply", "if_you_ignore", facts)

    # 2. Documents not in facts (Aadhaar, PAN) must be rejected
    assert not validate_summary_field("Submit Aadhaar card and PAN card immediately.", "what_to_do", facts)
    assert not validate_summary_field("आधार और पैन कार्ड जमा करें।", "what_to_do", facts)

    # 3. Consequences not in facts (account freeze, withdrawal freeze) must be rejected
    assert not validate_summary_field("Account freeze and ATM withdrawal stop will apply.", "if_you_ignore", facts)
    assert not validate_summary_field("खाता फ्रीज और निकासी पर रोक लगेगी।", "if_you_ignore", facts)

    # 4. Amounts not in facts must be rejected
    assert not validate_summary_field("Pay ₹500 fee.", "what_to_do", facts)

    # 5. Valid factual text using the notice's own wording must be accepted
    assert validate_summary_field("Riverside Cooperative Bank sent a KYC update notice dated 2026-11-01.", "what_is_this", facts)
    assert validate_summary_field("Submit one identity proof and one address proof.", "what_to_do", facts)
    assert validate_summary_field("Restrictions on debit transactions will apply.", "if_you_ignore", facts)


def test_notice_service_summary_caching():
    from backend.app.models.user import UserModel
    from backend.app.models.notice import NoticeModel
    from backend.app.services.notice_service import notice_service
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from backend.app.database import Base

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()

    user = UserModel(
        id="user-123",
        email="test@example.com",
        full_name="Test User",
        password_hash="pw",
        is_verified=True,
    )
    session.add(user)

    notice_result = {
        "notice_date": "2026-11-03",
        "headline": {
            "source_organisation": "Sunrise Power Distribution Company Ltd.",
            "notice_type": "electricity bill",
            "amount_due": {"amount": 4860.0, "currency": "INR"},
        },
        "deadlines": [
            {"id": "dl-1", "label": "Payment without surcharge", "date": "2026-11-18", "urgency": "fixed"},
        ],
        "action_steps": [
            {"order": 1, "text": "Pay online at portal", "group_title": "Pay the bill"},
        ],
        "consequences": [
            {"label": "Disconnection", "value": "Power supply may be disconnected"},
        ],
    }
    notice = NoticeModel(
        id="notice-summary-test",
        user_id="user-123",
        original_filename="electricity.pdf",
        stored_path="test/path.pdf",
        status="complete",
        result_json=notice_result,
    )
    session.add(notice)
    session.commit()

    # 1. First call generates and caches Hindi summary
    hi_summary = notice_service.get_notice_summary(
        session, "notice-summary-test", lang="hi", user_id="user-123"
    )
    assert hi_summary is not None
    assert "Sunrise Power Distribution Company Ltd." in hi_summary["what_is_this"]
    assert "₹4,860" in hi_summary["what_to_do"]
    assert "18 नवंबर 2026" in hi_summary["by_when"]

    # 2. Check DB persisted cache
    session.refresh(notice)
    assert "summary_cache" in notice.result_json
    assert "hi" in notice.result_json["summary_cache"]
    assert notice.result_json["summary_cache"]["hi"]["what_to_do"] == hi_summary["what_to_do"]

    # 3. Subsequent call returns immediately from cache
    cached_hi = notice_service.get_notice_summary(
        session, "notice-summary-test", lang="hi", user_id="user-123"
    )
    assert cached_hi == hi_summary

    # 4. Old notices without simple_summary work through same service
    old_notice = NoticeModel(
        id="old-notice-001",
        user_id="user-123",
        original_filename="old.pdf",
        stored_path="test/old.pdf",
        status="complete",
        result_json={
            "category": "bank",
            "source_organisation": "Riverside Cooperative Bank",
            "notice_date": "2026-11-01",
            "action_steps": [{"text": "Submit Aadhaar"}],
            "deadlines": [{"label": "ASAP", "urgency": "asap"}],
        },
    )
    session.add(old_notice)
    session.commit()

    old_sum = notice_service.get_notice_summary(session, "old-notice-001", lang="en", user_id="user-123")
    assert old_sum is not None
    assert "Riverside Cooperative Bank" in old_sum["what_is_this"]
    assert "No fixed date" in old_sum["by_when"]

