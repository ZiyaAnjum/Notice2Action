"""Extraction package for Notice to Action.

Handles PDF text extraction, OCR fallback, and LLM-driven structured extraction.
"""

from extraction.extractor import process_pdf

__all__ = ["process_pdf"]
__version__ = "0.1.0"
