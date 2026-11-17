"""OCR engine and fallback utilities for scanned and image-only PDF pages.

Supports two OCR backends selected via the OCR_MODE environment variable:
- 'tesseract': Local open-source OCR via pytesseract rendered at 300 DPI,
  evaluating --psm 6 and --psm 4 to choose the highest-quality candidate.
- 'gemini_vision': Cloud multimodal OCR via Google Gemini generateContent at 200 DPI.
- 'off' (default): OCR disabled; scanned pages trigger needs_clearer_document.
"""

import io
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any

from extraction.llm_client import BaseLLMClient, LLMError, sanitize_message
from validation.validator import normalize_whitespace

logger = logging.getLogger(__name__)

# Constants and default thresholds
TESSERACT_WINDOWS_SETUP_MESSAGE = (
    "Tesseract OCR is not installed or not on system PATH. "
    "On Windows, download and install Tesseract from UB-Mannheim "
    "(https://github.com/UB-Mannheim/tesseract/wiki) and add "
    "'C:\\Program Files\\Tesseract-OCR' to your system PATH."
)

DEFAULT_OCR_MODE = "off"
DEFAULT_MIN_CHARS = 30
DEFAULT_MIN_ALPHA_RATIO = 0.40
DEFAULT_OCR_DPI = 200
DEFAULT_TESSERACT_DPI = 300
DEFAULT_GEMINI_DPI = 200
DEFAULT_GEMINI_MAX_PAGES = 5

COMMON_WINDOWS_TESSERACT_PATHS = [
    Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
    Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
]


def get_ocr_mode() -> str:
    """Read the active OCR mode from environment ('off' | 'tesseract' | 'gemini_vision')."""
    return os.getenv("OCR_MODE", DEFAULT_OCR_MODE).lower().strip()


def check_ocr_quality(
    text: str | None,
    min_chars: int = DEFAULT_MIN_CHARS,
    min_alpha_ratio: float = DEFAULT_MIN_ALPHA_RATIO,
) -> tuple[bool, str]:
    """Validate whether extracted OCR text meets quality and readability criteria.

    Args:
        text: Raw string extracted by OCR.
        min_chars: Minimum character length required for usable page content.
        min_alpha_ratio: Minimum fraction of non-whitespace characters that must be alphanumeric.

    Returns:
        (is_usable, reason) tuple.
    """
    if not text:
        return False, "OCR output is empty."

    cleaned = normalize_whitespace(text)
    if not cleaned.strip():
        return False, "OCR output is empty."

    if len(cleaned.strip()) < min_chars:
        return (
            False,
            f"OCR text too short ({len(cleaned.strip())} chars < {min_chars} chars threshold).",
        )

    non_ws_chars = [c for c in cleaned if not c.isspace()]
    if not non_ws_chars:
        return False, "OCR output contains only whitespace."

    alpha_chars = [c for c in non_ws_chars if c.isalnum()]
    alpha_ratio = len(alpha_chars) / len(non_ws_chars)

    if alpha_ratio < min_alpha_ratio:
        return (
            False,
            f"OCR output appears to be non-alphanumeric noise or garbage "
            f"(alphanumeric ratio {alpha_ratio:.2f} < {min_alpha_ratio:.2f}).",
        )

    return True, "ok"


def is_tesseract_installed() -> tuple[bool, str | None]:
    """Detect whether Tesseract OCR binary and Python bindings are available.

    Returns:
        (is_available, setup_message_if_missing)
    """
    try:
        import pytesseract
    except ImportError:
        return False, (
            "pytesseract Python library is not installed. "
            "Please run 'pip install pytesseract' and configure Tesseract."
        )

    # 1. Check if tesseract binary is already resolved on system PATH
    which_path = shutil.which("tesseract")
    if which_path:
        return True, None

    # 2. Check standard Windows default install paths
    for candidate in COMMON_WINDOWS_TESSERACT_PATHS:
        if candidate.exists() and candidate.is_file():
            pytesseract.pytesseract.tesseract_cmd = str(candidate)
            logger.info("Found Tesseract binary at '%s'. Configured pytesseract.", candidate)
            return True, None

    # 3. Check %LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        local_candidate = Path(local_app_data) / "Programs" / "Tesseract-OCR" / "tesseract.exe"
        if local_candidate.exists() and local_candidate.is_file():
            pytesseract.pytesseract.tesseract_cmd = str(local_candidate)
            return True, None

    return False, TESSERACT_WINDOWS_SETUP_MESSAGE


def score_ocr_candidate(text: str | None) -> tuple[float, float, int]:
    """Score an OCR text candidate by dictionary token share, alphanumeric ratio, and character count.

    Args:
        text: Raw OCR candidate string.

    Returns:
        (dict_token_share, alpha_ratio, alnum_char_count)
    """
    if not text:
        return (0.0, 0.0, 0)

    tokens = text.split()
    if not tokens:
        return (0.0, 0.0, 0)

    dict_tokens = 0
    for tok in tokens:
        cleaned_tok = tok.strip(".,;:!?\"'()[]{}<>-/*#@$%^&_+=`~")
        if len(cleaned_tok) >= 2 and cleaned_tok.isalpha():
            dict_tokens += 1

    dict_token_share = dict_tokens / len(tokens)

    non_ws_chars = [c for c in text if not c.isspace()]
    if not non_ws_chars:
        return (0.0, 0.0, 0)

    alnum_chars = [c for c in non_ws_chars if c.isalnum()]
    alpha_ratio = len(alnum_chars) / len(non_ws_chars)
    alnum_char_count = len(alnum_chars)

    return (dict_token_share, alpha_ratio, alnum_char_count)


def select_best_ocr_text(
    text_psm6: str | None,
    text_psm4: str | None,
) -> tuple[str | None, int]:
    """Select the superior OCR candidate between PSM 6 (block) and PSM 4 (column).

    Selection heuristic:
    1. Prefer candidate with meaningfully higher share of dictionary-like tokens (delta > 0.02).
    2. If token share is similar, prefer candidate with meaningfully higher alphanumeric ratio (delta > 0.02).
    3. If both ratios are comparable, prefer the candidate that captured more alphanumeric characters.
    4. Default to PSM 6 on a complete tie.

    Returns:
        (best_text, chosen_psm)
    """
    if not text_psm6 and not text_psm4:
        return None, 6
    if not text_psm6:
        return text_psm4, 4
    if not text_psm4:
        return text_psm6, 6

    score_6 = score_ocr_candidate(text_psm6)
    score_4 = score_ocr_candidate(text_psm4)

    dict_share_6, alpha_ratio_6, alnum_count_6 = score_6
    dict_share_4, alpha_ratio_4, alnum_count_4 = score_4

    # 1. Compare dictionary-like token share (threshold delta: 0.02)
    if abs(dict_share_6 - dict_share_4) > 0.02:
        if dict_share_6 > dict_share_4:
            chosen_psm = 6
        else:
            chosen_psm = 4
    # 2. Compare alphanumeric ratio (threshold delta: 0.02)
    elif abs(alpha_ratio_6 - alpha_ratio_4) > 0.02:
        if alpha_ratio_6 > alpha_ratio_4:
            chosen_psm = 6
        else:
            chosen_psm = 4
    # 3. Compare alphanumeric character length
    else:
        if alnum_count_4 > alnum_count_6:
            chosen_psm = 4
        else:
            chosen_psm = 6

    chosen_score = score_6 if chosen_psm == 6 else score_4
    other_score = score_4 if chosen_psm == 6 else score_6
    other_psm = 4 if chosen_psm == 6 else 6

    logger.info(
        "Tesseract PSM selection: chosen PSM %d (dict_share=%.2f, alpha_ratio=%.2f, alnum_chars=%d) "
        "over PSM %d (dict_share=%.2f, alpha_ratio=%.2f, alnum_chars=%d)",
        chosen_psm,
        chosen_score[0],
        chosen_score[1],
        chosen_score[2],
        other_psm,
        other_score[0],
        other_score[1],
        other_score[2],
    )

    chosen_text = text_psm6 if chosen_psm == 6 else text_psm4
    return chosen_text, chosen_psm


def ocr_page_tesseract(
    page: Any,
    dpi: int = DEFAULT_TESSERACT_DPI,
) -> tuple[str | None, str | None]:
    """Render page at specified DPI (default 300) and execute Tesseract OCR.

    Runs pytesseract with --psm 6 and --psm 4, evaluates both results based on
    dictionary token share and alphanumeric ratio, keeps the superior candidate,
    and logs which PSM was chosen.

    Never crashes. Returns clear setup instructions if Tesseract binary is missing.

    Args:
        page: PyMuPDF Page object.
        dpi: Pixmap rasterization DPI (default 300).

    Returns:
        (ocr_text, error_message)
    """
    is_avail, missing_msg = is_tesseract_installed()
    if not is_avail:
        logger.warning("Tesseract OCR requested but binary not found: %s", missing_msg)
        return None, missing_msg

    try:
        import pytesseract
        from PIL import Image

        pix = page.get_pixmap(dpi=dpi)
        img = Image.open(io.BytesIO(pix.tobytes("png")))

        # Run with PSM 6 (single uniform block)
        text_psm6: str | None = None
        try:
            text_psm6 = pytesseract.image_to_string(img, lang="eng", config="--psm 6")
        except Exception as e_psm6:
            logger.warning("Tesseract --psm 6 attempt failed: %s", e_psm6)

        # Run with PSM 4 (single column variable sizes)
        text_psm4: str | None = None
        try:
            text_psm4 = pytesseract.image_to_string(img, lang="eng", config="--psm 4")
        except Exception as e_psm4:
            logger.warning("Tesseract --psm 4 attempt failed: %s", e_psm4)

        if not text_psm6 and not text_psm4:
            # Fallback to standard pytesseract run if custom configs both failed
            try:
                raw_text = pytesseract.image_to_string(img, lang="eng")
                return raw_text, None
            except Exception as exc:
                return None, f"Tesseract extraction error: {exc}"

        best_text, _ = select_best_ocr_text(text_psm6, text_psm4)
        return best_text, None
    except Exception as exc:
        err_msg = f"Tesseract execution error: {exc}"
        logger.warning(err_msg)
        return None, err_msg


def ocr_page_gemini_vision(
    page: Any,
    client: BaseLLMClient,
    dpi: int = DEFAULT_GEMINI_DPI,
) -> tuple[str | None, str | None]:
    """Render page image and transcribe verbatim text using Gemini vision model.

    Never crashes. Reuses the client's retry, backoff, and fallback model logic.

    Args:
        page: PyMuPDF Page object.
        client: BaseLLMClient implementation with vision transcription capability.
        dpi: Pixmap rasterization DPI (default 200).

    Returns:
        (ocr_text, error_message)
    """
    try:
        pix = page.get_pixmap(dpi=dpi)
        img_bytes = pix.tobytes("png")
        prompt = (
            "Transcribe the complete, verbatim text of this official notice page image exactly "
            "as written. Do not summarize, explain, or interpret. Output only the verbatim extracted text."
        )
        transcribed_text = client.transcribe_image(
            img_bytes, mime_type="image/png", prompt=prompt
        )
        return transcribed_text, None
    except LLMError as exc:
        safe_msg = sanitize_message(exc.message)
        logger.warning("Gemini vision transcription failed: %s", safe_msg)
        return None, f"Gemini vision transcription failed: {safe_msg}"
    except Exception as exc:
        safe_msg = sanitize_message(str(exc))
        logger.warning("Unexpected error during vision transcription: %s", safe_msg)
        return None, f"Vision OCR failed: {safe_msg}"


def repair_ocr_spacing(text: str | None) -> str:
    """Repair common OCR spacing and punctuation artifacts for clean human display.

    Applies post-OCR cleanup for display and summaries only; never applied to
    the text used for verbatim quote grounding.

    Fixes:
    - Hyphenated line breaks ('word-\nnext' -> 'wordnext').
    - Spacing before punctuation ('word , ' -> 'word, ').
    - Missing spacing after punctuation when followed by letters ('word,next' -> 'word, next').
    - Missing spacing after period when followed by uppercase letter ('notice.All' -> 'notice. All').
    - Spacing inside brackets and parentheses ('( 10 Dec )' -> '(10 Dec)').
    - Collapses redundant horizontal spaces while preserving line structure.
    """
    if not text:
        return ""

    s = text

    # 1. Hyphenated word wrap at line breaks (e.g. 'submis-\nsion' -> 'submission')
    s = re.sub(r"(\b[A-Za-z]{2,})-\s*\n\s*([A-Za-z]{2,}\b)", r"\1\2", s)

    # 2. Remove space before punctuation: , . : ; ! ? ) ] }
    s = re.sub(r"[ \t]+([,.:;!?\)\]\}])", r"\1", s)

    # 3. Remove space after opening brackets: ( [ {
    s = re.sub(r"([\(\[\{])[ \t]+", r"\1", s)

    # 4. Insert missing space after commas/semicolons when immediately followed by a letter
    s = re.sub(r"([,;])([A-Za-z])", r"\1 \2", s)

    # 5. Insert missing space after colon when immediately followed by a letter (except URLs like http://)
    s = re.sub(r"(?<!https)(?<!http):([A-Za-z])", r": \1", s)

    # 6. Insert missing space after period followed by uppercase letter (avoiding domains and decimals)
    s = re.sub(r"([a-z]{2,})\.([A-Z])", r"\1. \2", s)

    # 7. Collapse redundant horizontal spaces (preserve newlines)
    s = re.sub(r"[^\S\r\n]+", " ", s)

    # 8. Collapse 3+ newlines to 2 newlines
    s = re.sub(r"\n\s*\n\s*\n+", "\n\n", s)

    return s.strip()
