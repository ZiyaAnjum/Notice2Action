"""Language detection and Unicode-safe text normalization for multilingual notices.

Supports script-based language identification across English, Devanagari (Hindi, Marathi),
Kannada, Tamil, Telugu, and other Indian official languages, alongside Unicode NFC normalization
for robust evidence quote grounding.
"""

import logging
import re
import unicodedata
from typing import Any

logger = logging.getLogger(__name__)

# Unicode ranges for scripts commonly encountered in Indian official notices
SCRIPT_RANGES: dict[str, tuple[str, str, str]] = {
    # script_name: (code, regex_range, language_label)
    "devanagari": ("hi", r"\u0900-\u097F", "Hindi"),
    "kannada": ("kn", r"\u0C80-\u0CFF", "Kannada"),
    "tamil": ("ta", r"\u0B80-\u0BFF", "Tamil"),
    "telugu": ("te", r"\u0C00-\u0C7F", "Telugu"),
    "bengali": ("bn", r"\u0980-\u09FF", "Bengali"),
    "gujarati": ("gu", r"\u0A80-\u0AFF", "Gujarati"),
    "malayalam": ("ml", r"\u0D00-\u0D7F", "Malayalam"),
    "gurmukhi": ("pa", r"\u0A00-\u0A7F", "Punjabi"),
    "odia": ("or", r"\u0B00-\u0B7F", "Odia"),
}

LATIN_REGEX = re.compile(r"[a-zA-Z]")
ZERO_WIDTH_REGEX = re.compile(r"[\u200B-\u200D\uFEFF\u00AD]")


def unicode_normalize_whitespace(text: str) -> str:
    """Normalize Unicode to canonical NFC, straighten curly quotes, and collapse whitespace.

    Args:
        text: Raw text string to normalize.

    Returns:
        Cleaned, NFC-normalized string with straight quotes and collapsed whitespace.
    """
    if not text:
        return ""
    # 1. Canonical Unicode Normalization (NFC converts decomposed vowels/matras to precomposed)
    text = unicodedata.normalize("NFC", str(text))
    # 2. Straighten quotation marks
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    # 3. Strip zero-width joiners / non-joiners / soft hyphens that frequently vary in PDF extraction
    text = ZERO_WIDTH_REGEX.sub("", text)
    # 4. Collapse consecutive whitespace while preserving case
    return re.sub(r"\s+", " ", text).strip()


def unicode_normalize_text(text: str) -> str:
    """Normalize Unicode to canonical NFC, lowercase, and collapse whitespace for evidence grounding.

    Args:
        text: Raw text string to normalize.

    Returns:
        NFC-normalized, lowercased string.
    """
    cleaned = unicode_normalize_whitespace(text)
    return unicodedata.normalize("NFC", cleaned.lower())


def detect_document_language(pages: list[dict[str, Any]]) -> dict[str, Any]:
    """Detect primary language and script of a document across its extracted pages.

    Uses a lightweight, deterministic script character frequency analysis.
    If non-Latin Indic characters form a noticeable fraction (>= 10% or >= 30 chars),
    the notice is flagged as non-English, identifying the specific script (e.g. Hindi, Kannada).

    Args:
        pages: List of page dictionaries with 'text' field.

    Returns:
        Dict containing:
        - language: Language code (e.g. 'en', 'hi', 'kn', 'ta', etc.)
        - is_english: Boolean, True if predominantly English
        - script: Script name (e.g. 'latin', 'devanagari', 'kannada')
        - script_counts: Raw character count per script
        - confidence: Estimated confidence score (0.0 to 1.0)
    """
    full_text = " ".join(p.get("text", "") for p in pages)
    if not full_text.strip():
        return {
            "language": "en",
            "is_english": True,
            "script": "latin",
            "script_counts": {},
            "confidence": 1.0,
        }

    # Count Latin letters
    latin_count = len(LATIN_REGEX.findall(full_text))

    # Count characters in each Indic script
    script_counts: dict[str, int] = {}
    total_indic_count = 0
    for script_name, (_lang_code, script_range, _) in SCRIPT_RANGES.items():
        pattern = re.compile(f"[{script_range}]")
        count = len(pattern.findall(full_text))
        if count > 0:
            script_counts[script_name] = count
            total_indic_count += count

    total_alpha = latin_count + total_indic_count

    if total_alpha == 0:
        return {
            "language": "en",
            "is_english": True,
            "script": "latin",
            "script_counts": script_counts,
            "confidence": 1.0,
        }

    # If Indic script characters are present and represent >= 10% of characters or at least 30 chars
    indic_ratio = total_indic_count / total_alpha
    if total_indic_count >= 30 or (indic_ratio >= 0.10 and total_indic_count >= 10):
        # Identify the dominant Indic script
        dominant_script = "devanagari"
        max_c = 0
        for s_name, c in script_counts.items():
            if c > max_c:
                max_c = c
                dominant_script = s_name

        lang_code = SCRIPT_RANGES[dominant_script][0]
        confidence = round(min(1.0, max(0.6, max_c / max(1, total_indic_count))), 2)

        logger.info(
            "Non-English notice detected: lang=%s (%s), indic_count=%d, latin_count=%d, ratio=%.2f",
            lang_code,
            dominant_script,
            total_indic_count,
            latin_count,
            indic_ratio,
        )
        return {
            "language": lang_code,
            "is_english": False,
            "script": dominant_script,
            "script_counts": script_counts,
            "confidence": confidence,
        }

    return {
        "language": "en",
        "is_english": True,
        "script": "latin",
        "script_counts": script_counts,
        "confidence": round(latin_count / total_alpha, 2),
    }
