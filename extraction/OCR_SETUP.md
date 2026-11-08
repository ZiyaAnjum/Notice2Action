# Optical Character Recognition (OCR) Setup & Usage Guide

Notice to Action provides an optional OCR fallback mechanism for scanned and image-only PDF documents that lack digital text streams.

By default, Notice to Action operates in **`OCR_MODE=off`**, strictly requiring digital PDF documents and refusing scanned files early with a `needs_clearer_document` status to maintain high extraction accuracy and avoid hallucination.

When enabled, the pipeline supports two OCR backends:
1. **`tesseract`**: Fast, local, private, open-source OCR using `pytesseract` and Tesseract-OCR.
2. **`gemini_vision`**: Cloud multimodal OCR using Google Gemini's vision capability for verbatim text transcription without requiring local binary compilation or installation.

---

## Environment Variables

Configure the OCR subsystem by setting these environment variables:

| Variable | Default | Allowed Values | Description |
| :--- | :--- | :--- | :--- |
| `OCR_MODE` | `off` | `off`, `tesseract`, `gemini_vision` | Active OCR fallback engine. `off` refuses scans without calling OCR. |
| `OCR_GEMINI_MAX_PAGES` | `5` | Integer $\ge 1$ | Maximum number of scanned pages transcribed via Gemini vision per document. |
| `OCR_DPI` | `200` | Integer $\ge 150$ | Pixmap rendering resolution for scanned pages (default 200 DPI). |
| `OCR_MIN_CHARS` | `30` | Integer $\ge 10$ | Minimum characters required for OCR text to be considered usable. |
| `OCR_MIN_ALPHA_RATIO`| `0.40` | Float $0.0 - 1.0$ | Minimum ratio of alphanumeric characters to filter noise and artifacts. |
| `PIPELINE_TOTAL_TIMEOUT_SEC` | `60` | Integer $\ge 10$ | Total end-to-end execution timeout across all extraction steps. |

---

## Backend 1: Local Tesseract OCR (`OCR_MODE=tesseract`)

The local Tesseract backend runs entirely on the host machine, keeping all document contents on-device.

### Prerequisites & Python Package
Ensure the Python wrapper is installed in your virtual environment:
```powershell
pip install pytesseract
```

### Windows Installation Guide
1. **Download Installer**:
   Download the latest 64-bit Windows installer from the official UB-Mannheim repository:
   [https://github.com/UB-Mannheim/tesseract/wiki](https://github.com/UB-Mannheim/tesseract/wiki)
   *(e.g., `tesseract-ocr-w64-setup-5.4.0.20240606.exe`)*

2. **Run the Installer**:
   Install into the default location:
   ```
   C:\Program Files\Tesseract-OCR
   ```
   *(Ensure English language data `eng.traineddata` is selected)*

3. **Add to System PATH**:
   - Open **Windows Settings** $\rightarrow$ Search for **Edit the system environment variables**.
   - Click **Environment Variables...**.
   - Under **System variables**, select `Path` and click **Edit...**.
   - Click **New** and add: `C:\Program Files\Tesseract-OCR`
   - Click **OK** to save.

4. **Verify Installation**:
   Open a new PowerShell or Command Prompt terminal and run:
   ```powershell
   tesseract --version
   ```
   Verify Python integration:
   ```powershell
   python -c "import pytesseract; print('Tesseract version:', pytesseract.get_tesseract_version())"
   ```

> [!NOTE]
> Notice to Action includes automatic path resolution: if Tesseract is not found on your system PATH, it automatically searches `C:\Program Files\Tesseract-OCR\tesseract.exe` and `%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe` before reporting an issue.

---

## Backend 2: Gemini Vision OCR (`OCR_MODE=gemini_vision`)

The Gemini Vision backend requires no local binary installation. It renders scanned pages at 200 DPI and sends page images to the configured Gemini model (`gemini-2.5-flash` or fallback) with a strict verbatim transcription prompt.

### Activation
Set in your `.env` or system environment:
```powershell
OCR_MODE=gemini_vision
GEMINI_API_KEY=your_gemini_api_key
```

### Page Cap
To prevent excessive API usage and avoid latency spikes on large documents, vision transcription is capped by `OCR_GEMINI_MAX_PAGES` (default: 5 pages). If a scanned document exceeds this cap, remaining pages are skipped and an `OCR_PAGE_CAP_REACHED` warning is attached to the output.

### Privacy Notice (External Service)
> [!WARNING]
> **Data Privacy Notice**: When `OCR_MODE=gemini_vision` is enabled, rendered page images of scanned documents are transmitted to Google's Gemini API for OCR text transcription.
> 
> If your deployment processes confidential, HIPAA, legal, or sensitive institutional documents that must not leave local infrastructure, use **`OCR_MODE=tesseract`** or **`OCR_MODE=off`**.

---

## Pipeline Behavior With OCR

1. **Tagging & Tracking**:
   - When OCR is executed on any page, the pipeline sets `ocr_used: true` on the result.
   - The document's `needs_verification` flag is automatically set to `true`.
   - A standard user-facing warning is attached:
     ```json
     {
       "code": "OCR_USED",
       "warning_text": "This notice was read from a scan. Please check all details against your original.",
       "severity": "warning"
     }
     ```

2. **Mixed Documents**:
   - In documents containing both digital vector text and scanned images, OCR is **only** performed on pages lacking usable digital text. Pages with usable text ($\ge 30$ chars) are extracted directly from vector streams.
   - If an individual page in a multi-page document fails OCR quality checks, the pipeline continues processing all readable pages and attaches a warning identifying the unreadable page(s):
     ```json
     {
       "code": "PARTIAL_PAGE_UNREADABLE",
       "warning_text": "Page(s) 2 could not be read clearly and were skipped.",
       "severity": "warning"
     }
     ```

3. **Quote Grounding & Quality Control**:
   - Extracted OCR text participates in the same verbatim quote grounding, date conflict detection, and language analysis as digital text.
   - Low-quality OCR output (under 30 characters or composed of more than 60% non-alphanumeric noise) is rejected to prevent hallucinations.

---

## Testing OCR Offline

You can test OCR handling offline without live API credentials using the included scanned test fixture:
```powershell
# Run OCR unit and pipeline tests
pytest extraction/tests/test_ocr.py -v
```

