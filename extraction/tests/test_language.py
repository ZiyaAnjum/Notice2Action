"""Unit tests for language detection and Unicode-safe quote normalization."""

import unicodedata

from extraction.language import (
    detect_document_language,
    unicode_normalize_text,
)


def test_detect_english_document():
    pages = [
        {"page_number": 1, "text": "GOVERNMENT OF MAHARASHTRA\nDepartment of Higher Education"},
        {"page_number": 2, "text": "Submit application before 15 December 2026."},
    ]
    res = detect_document_language(pages)
    assert res["language"] == "en"
    assert res["is_english"] is True
    assert res["script"] == "latin"


def test_detect_hindi_devanagari_document():
    pages = [
        {
            "page_number": 1,
            "text": "महाराष्ट्र शासन उच्च व तंत्र शिक्षण विभाग सूचना. अंतिम दिनांक 15 डिसेंबर 2026.",
        }
    ]
    res = detect_document_language(pages)
    assert res["language"] == "hi"
    assert res["is_english"] is False
    assert res["script"] == "devanagari"


def test_detect_kannada_document():
    pages = [
        {
            "page_number": 1,
            "text": "ಕರ್ನಾಟಕ ಸರ್ಕಾರ ಕಾಲೇಜು ಶಿಕ್ಷಣ ಇಲಾಖೆ ಸುತ್ತೋಲೆ. ಕೊನೆಯ ದಿನಾಂಕ 20 ನವೆಂಬರ್ 2026.",
        }
    ]
    res = detect_document_language(pages)
    assert res["language"] == "kn"
    assert res["is_english"] is False
    assert res["script"] == "kannada"


def test_detect_bilingual_notice_with_indic():
    # Mixed English header but significant Hindi body
    pages = [
        {
            "page_number": 1,
            "text": "ELECTRICITY DISTRIBUTION COMPANY LTD.\n\n"
            "विद्युत बिल भुगतान अंतिम सूचना पत्र क्रमांक 1024.\n"
            "सभी उपभोक्ताओं को सूचित किया जाता है कि बकाया राशि का भुगतान 15 नवंबर 2026 तक अवश्य करें।",
        }
    ]
    res = detect_document_language(pages)
    assert res["language"] == "hi"
    assert res["is_english"] is False


def test_unicode_nfc_nfd_grounding_match():
    # String with precomposed character: U+0958 is QA (क़) (1 code point)
    nfc_text = "\u0958\u093f\u0938\u094d\u0924 2026"
    nfd_text = unicodedata.normalize("NFD", nfc_text)

    # In raw form without NFC normalization, NFD and NFC differ in code points
    assert nfd_text != nfc_text
    assert len(nfd_text) > len(nfc_text)

    # With unicode_normalize_text, both resolve to identical NFC form
    norm_nfd = unicode_normalize_text(nfd_text)
    norm_nfc = unicode_normalize_text(nfc_text)
    assert norm_nfd == norm_nfc
    assert norm_nfd in norm_nfc


def test_unicode_kannada_with_zero_width_chars():
    # Kannada text with zero-width non-joiner injected
    clean_kn = "ಕೊನೆಯ ದಿನಾಂಕ 2026"
    zw_kn = "ಕೊ\u200Cನೆಯ ದಿ\u200Dನಾಂಕ 2026"

    norm_clean = unicode_normalize_text(clean_kn)
    norm_zw = unicode_normalize_text(zw_kn)
    assert norm_clean == norm_zw
