# Phase 7a Contract Changes & Handoff Specifications

This document outlines the contracts, schema updates, UI specs, and evaluation changes introduced in **Phase 7a (Triage and General Mode)**.

All implementation diffs for files outside the extraction and schema lane (`backend/`, `frontend/`, `evaluation/`, and root `tests/`) have been preserved as standalone unified patches in [`handoff_patches/`](file:///c:/Users/user/Notice2Action/handoff_patches). Other team members can inspect and apply them directly using `git apply handoff_patches/<patch_name>.patch`.

---

## 1. Overview of Phase 7a Architecture Changes

Phase 7a replaces the legacy hard-refusal rule ("any unclassified category is immediately refused") with a **two-step triage process**:
1. **Rule-Based Classifier (Fast First Guess)**: Scans text for high-confidence keywords/phrases in the 5 core tested categories.
   - If confidence $\ge 0.85$ on a tested category, **LLM triage is skipped** to save latency and cost.
2. **LLM Triage Call**: If confidence $< 0.85$ or the document does not match a tested category, a lightweight, JSON-only triage call analyzes the first 2 pages:
   - Output: `{"is_actionable_notice": bool, "category": string, "confidence": float, "reason": string}`
   - Categories: `scholarship_or_college`, `bank`, `utility`, `tax_or_payment`, `government_scheme`, `insurance_or_health`, `legal_or_court`, `employment`, `other_official_notice`, `not_a_notice`.
3. **Trust Tier Decision**:
   - `not_a_notice` or `is_actionable_notice: false` $\rightarrow$ Refuse with `status: "out_of_scope"` and a plain-language explanation using `reason`.
   - Tested Category $\rightarrow$ Process normally with `trust_level: "tested"`.
   - General Mode Category (`insurance_or_health`, `legal_or_court`, `employment`, `other_official_notice`) $\rightarrow$ Process through the extraction pipeline with `trust_level: "general"` and `needs_verification: true`.

---

## 2. Member 2 (M2): Backend API & Models

### Responsibilities
Pass `trust_level` through database models and the REST API so the frontend and API consumers can distinguish tested notices from general-mode notices.

### Required Changes
1. **Notice Model ([`backend/app/models/notice.py`](file:///c:/Users/user/Notice2Action/backend/app/models/notice.py))**:
   - In `NoticeModel.to_dict()`, include `trust_level`:
     ```python
     trust_level = (
         self.result_json.get("trust_level", "tested")
         if isinstance(self.result_json, dict)
         else "tested"
     )
     return {
         ...
         "trust_level": trust_level,
         ...
     }
     ```
2. **Notice Service ([`backend/app/services/notice_service.py`](file:///c:/Users/user/Notice2Action/backend/app/services/notice_service.py))**:
   - In `get_notice_detail()`, include `trust_level`:
     ```python
     trust_level = (
         notice.result_json.get("trust_level", "tested")
         if isinstance(notice.result_json, dict)
         else "tested"
     )
     return {
         ...
         "trust_level": trust_level,
         ...
     }
     ```
3. **Backend API Tests ([`backend/tests/test_api.py`](file:///c:/Users/user/Notice2Action/backend/tests/test_api.py))**:
   - Update `test_scanned_and_recipe_refusal_without_llm`:
     - Scanned/unreadable documents still refuse with zero LLM calls (`fake_llm.call_count == 0`).
     - Out-of-scope non-notices (e.g. recipe) now execute one triage LLM call (`call_count == 1`) and refuse with `status: "out_of_scope"` without calling full structured extraction.

### Handoff Patches
- `git apply handoff_patches/backend_app_models_notice.py.patch`
- `git apply handoff_patches/backend_app_services_notice_service.py.patch`
- `git apply handoff_patches/backend_tests_test_api.py.patch`

---

## 3. Member 3 (M3): Frontend Dashboard & Categories

### Responsibilities
Display the general-mode warning banner, map category labels for the new general-mode categories, and update the supported categories list on the out-of-scope screen.

### 1. Trust Level Values
- `"tested"`: The 5 core notice categories.
- `"general"`: Expanded general-mode notice categories.

### 2. Notice Categories
- **Core Tested Categories**:
  - `scholarship_or_college`
  - `bank`
  - `utility`
  - `tax_or_payment`
  - `government_scheme`
- **Expanded General-Mode Categories**:
  - `insurance_or_health`
  - `legal_or_court`
  - `employment`
  - `other_official_notice`
- **Out of Scope / Refusal**:
  - `other_out_of_scope` (and triage `not_a_notice`)

### 3. General-Mode Alert Banner
When `notice.trust_level === "general"` (or `result.trust_level === "general"`), render the prominent amber banner:
- **Title**:
  ```text
  This type of notice is less tested. Please check every item against your original notice.
  ```
- **Description**:
  ```text
  We extracted the information below in general mode. Since this category is less tested than our core notice types, please review all dates, requirements, and amounts carefully against your original document.
  ```
- **Banner Appearance**: Displayed only when `trust_level === "general"`. Omitted when `trust_level === "tested"`.

### 4. Category Label Mappings ([`frontend/src/utils/categories.js`](file:///c:/Users/user/Notice2Action/frontend/src/utils/categories.js))
Update `CATEGORY_LABELS`:
```javascript
export const CATEGORY_LABELS = {
  // Tested categories
  scholarship_or_college: "Scholarship & Education",
  bank: "Banking & Finance",
  utility: "Utilities & Services",
  tax_or_payment: "Tax & Revenue",
  government_scheme: "Government Benefits & Schemes",
  // General mode categories
  insurance_or_health: "Insurance & Health",
  legal_or_court: "Court & Legal",
  employment: "Employment & Workplace",
  other_official_notice: "Other Official Notice",
  // Out of scope
  other_out_of_scope: "Unsupported Document",
};
```
Update `SUPPORTED_CATEGORIES` list to include both `(Tested)` and `(General Mode)` descriptors for users viewing the out-of-scope refusal screen.

### Handoff Patches
- `git apply handoff_patches/frontend_src_pages_NoticeDashboardPage.jsx.patch`
- `git apply handoff_patches/frontend_src_tests_dashboard.test.jsx.patch`
- `git apply handoff_patches/frontend_src_utils_categories.js.patch`

---

## 4. Member 4 (M4): Evaluation Harness & Benchmarks

### Responsibilities
Track and partition evaluation metrics by trust tier (`tested` vs `general`) so that general-mode exploratory accuracy never contaminates the core PRD benchmark numbers. Ensure `--fake` mode outputs prominent warning banners.

### 1. Annotation Schema ([`schemas/annotation.schema.json`](file:///c:/Users/user/Notice2Action/schemas/annotation.schema.json))
- Added `expected_category` enum covering all 9 actionable categories:
  `["scholarship_or_college", "bank", "utility", "tax_or_payment", "government_scheme", "insurance_or_health", "legal_or_court", "employment", "other_official_notice", "other_out_of_scope"]`
- Added optional `expected_trust_level` field (`enum: ["tested", "general"]`). If omitted, it automatically resolves to `"tested"` for the 5 core categories and `"general"` for the 4 expanded categories.

### 2. Metric Partitioning ([`evaluation/metrics.py`](file:///c:/Users/user/Notice2Action/evaluation/metrics.py))
- In `evaluate_single_notice()`: records `expected_trust_level` and `predicted_trust_level`.
- In `aggregate_evaluation_results()`: partitions notices into:
  - `tested_evals = [e for e in eval_list if e.get("expected_trust_level") == "tested"]`
  - `general_evals = [e for e in eval_list if e.get("expected_trust_level") == "general"]`
- Calculates metrics for each tier independently.
- `targets_vs_measured` (PRD Section 9 targets) evaluates strictly against `tested_summary`. General-mode accuracy is tracked separately under `by_trust_level.general`.

### 3. Markdown Report & Fake Mode ([`evaluation/run_eval.py`](file:///c:/Users/user/Notice2Action/evaluation/run_eval.py))
- When `--fake` is active, injects at the very top of `report.md`:
  ```markdown
  # ⚠️ FAKE MODE, NOT REAL RESULTS ⚠️
  > **WARNING**: This evaluation report was generated using canned mock responses (FakeLLMClient).
  > It does NOT represent real LLM accuracy, real extraction performance, or true model benchmarks.
  ```
- Adds top-level `"banner": "FAKE MODE, NOT REAL RESULTS"` and `"warning"` in `latest.json`.
- Adds a "Trust-Tier Breakdown (Tested vs. General Mode)" table in `report.md`.

### Handoff Patches
- `git apply handoff_patches/evaluation_metrics.py.patch`
- `git apply handoff_patches/evaluation_run_eval.py.patch`
- `git apply handoff_patches/evaluation_results_latest.json.patch`
- `git apply handoff_patches/evaluation_results_report.md.patch`
- `git apply handoff_patches/tests_test_evaluation_metrics.py.patch`

---

## 5. Applying Patches

All patches can be applied from the repository root:
```powershell
# Backend (M2)
git apply handoff_patches/backend_app_models_notice.py.patch
git apply handoff_patches/backend_app_services_notice_service.py.patch
git apply handoff_patches/backend_tests_test_api.py.patch

# Frontend (M3)
git apply handoff_patches/frontend_src_pages_NoticeDashboardPage.jsx.patch
git apply handoff_patches/frontend_src_tests_dashboard.test.jsx.patch
git apply handoff_patches/frontend_src_utils_categories.js.patch

# Evaluation (M4)
git apply handoff_patches/evaluation_metrics.py.patch
git apply handoff_patches/evaluation_run_eval.py.patch
git apply handoff_patches/evaluation_results_latest.json.patch
git apply handoff_patches/evaluation_results_report.md.patch
git apply handoff_patches/tests_test_evaluation_metrics.py.patch
```

---

# Phase 7b Contract Changes & Specifications

This section details the contracts, schema updates, user-facing warnings, language handling, and layout specifications introduced in **Phase 7b (Long Documents, Language Handling, and Layout Robustness)**.

`PROMPT_VERSION` is bumped to **`1.6.0`**.

---

## 1. Long Documents: Whole-Page Chunking & Merging

When official notices or government circulars exceed the character budget, the pipeline partitions the document into whole pages and merges extracted results.

### Configuration
- `LLM_PROMPT_CHAR_BUDGET`: Configurable environment variable for the prompt character budget.
  - **Default**: `12000` characters.
  - Documents with total text $\le 12,000$ characters are processed in a single LLM extraction call.
  - Documents exceeding the budget are chunked into contiguous whole-page groups (no pages are ever split in the middle, and no pages are truncated).
- `PIPELINE_TOTAL_TIMEOUT_SEC`: Configurable total pipeline wall-clock time budget.
  - **Default**: `60.0` seconds.
  - When total document processing exceeds this time limit, processing halts gracefully and returns:
    - `status: "extraction_failed"`
    - `failure_reason: "too_slow"`
    - `error_code: "DOCUMENT_PROCESSING_TIMEOUT"`
    - `message: "The document is too large or processing exceeded the 60-second time budget. Please retry or provide a shorter excerpt."`
    - `needs_verification: true`

### Merging & Deduplication Rules
- **Critical Header Fields** (`notice_title`, `issuing_organisation`, `affected_party`, `main_purpose`): First non-empty, found value across chunks is retained.
- **Deadlines**: Deduplicated by `(normalized date, normalized description)`.
  - Staged deadlines (primary + extended) are preserved without conflict.
  - If different chunks yield conflicting primary deadlines for the same obligation, the pipeline flags both with `status: "conflicting"` and provides a conflict reason identifying both dates.
- **Required Documents**: Deduplicated by normalized document name. Original `source_page` and `evidence_quote` are preserved.
- **Action Steps**: Deduplicated by normalized action text, preserving evidence quotes/pages and renumbered sequentially (1, 2, 3...).
- **Penalties & User Warnings**: Deduplicated by normalized text.

### User-Facing Warning Note
When chunking occurs on long documents, the pipeline automatically inserts a user-facing warning into `warnings`:
```json
{
  "warning_text": "This is a long document; please check all items.",
  "code": "LONG_DOCUMENT_CHUNKED",
  "severity": "info",
  "evidence_quote": null,
  "source_page": null
}
```
And sets `needs_verification: true`.

---

## 2. Language Handling & Multilingual Notices

### Lightweight Script Detection
- Script-based detection scans characters across all pages for Indian official scripts (Devanagari, Kannada, Tamil, Telugu, Bengali, Gujarati, Malayalam, Gurmukhi, Odia) vs. Latin.
- When Indic characters represent $\ge 10\%$ of script characters (or at least 30 characters), the document is identified as non-English.
- Primary language code is identified (e.g. `"hi"`, `"kn"`, `"ta"`, etc.).

### Schema Contract Update ([`schemas/notice_output.schema.json`](file:///c:/Users/user/Notice2Action/schemas/notice_output.schema.json))
A new field `detected_language` is added to the notice output schema:
```json
"detected_language": {
  "type": "string",
  "description": "Detected primary language or script code of the notice (e.g. 'en', 'hi', 'kn')."
}
```
`pipeline.py` returns `detected_language` at the top level and inside `result["detected_language"]`.

### Non-English Extraction Rules
1. **Summary & Descriptions in English**: `plain_language_summary`, action steps descriptions, and field interpretations are written in English for accessibility.
2. **Evidence Quotes Kept in Original Language**: `evidence_quote` values must **NEVER** be translated. They remain verbatim in the original script and language (e.g. Devanagari or Kannada).
3. **Unicode NFC Grounding**:
   - `unicode_normalize_text()` applies canonical Unicode NFC decomposition/composition (`unicodedata.normalize('NFC', ...)`).
   - Strips zero-width joiners/spaces (`[\u200B-\u200D\uFEFF\u00AD]`) and collapses whitespace.
   - Ensures combining characters, matras, and nuktas match character-for-character between PDF text and LLM quotes.
4. **User-Facing Warning Note**:
   Inserted into `warnings`:
   ```json
   {
     "warning_text": "This notice is not in English. These notices are less tested. Please check every item.",
     "code": "NON_ENGLISH_NOTICE",
     "severity": "warning",
     "evidence_quote": null,
     "source_page": null
   }
   ```
   And sets `needs_verification: true`.

---

## 3. Layout Fixtures & PDF Reading Order

Five realistic programmatic test fixtures are available in [`tests/fixtures/`](file:///c:/Users/user/Notice2Action/tests/fixtures/):
1. **`letterhead_table.pdf`**: Letterhead + tabular fee and deadline schedule (Advance 15-Nov-2026, Regular 30-Nov-2026, Extended 15-Dec-2026).
2. **`two_column.pdf`**: Multi-column layout with left column (eligibility & steps) and right column (deadlines & venues).
3. **`bilingual.pdf`**: Dual-language notice with English and Marathi/Hindi Devanagari rendered with system Unicode font (`Nirmala.ttc`).
4. **`repeated_footer.pdf`**: 3-page notice with repeated multi-line legal confidentiality boilerplate in the footer of every page.
5. **`twelve_page.pdf`**: 12-page comprehensive circular (14,237 characters) validating whole-page chunking, pagination retention, and time budgets.

### Two-Column Reading Order Finding
- **PyMuPDF (`fitz` / `page.get_text('text')`)**:
  PyMuPDF's layout analysis groups text spans into geometric blocks separated by whitespace gutters. On `two_column.pdf`, it reads:
  1. Top centered headers across the page width.
  2. The **entire left column** top-to-bottom.
  3. The **entire right column** top-to-bottom.
  It does **not** interleave lines horizontally across column gutters, ensuring that text semantics within each column remain coherent for LLM extraction.

