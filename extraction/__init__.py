"""Extraction package for Notice to Action.

Handles PDF text extraction, OCR fallback, and LLM-driven structured extraction.
"""

from extraction.extractor import process_pdf
from extraction.llm_extractor import PROMPT_VERSION

__all__ = ["process_pdf", "PROMPT_VERSION"]
__version__ = "0.1.0"
