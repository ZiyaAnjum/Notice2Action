# Product Requirements Document (PRD) Traceability Matrix

This document provides a comprehensive, honest traceability mapping from the Functional Requirements (FR-01 through FR-10) defined in the **Notice to Action** Product Requirements Document (PRD) to their actual architectural implementations, test suites, and current completion status.

---

## 1. Requirements Traceability Matrix

| Requirement ID | Requirement Name | PRD Target / Criteria | Implementation Location | Test Verification | Status |
|---|---|---|---|---|---|
| **FR-01** | **Document Upload & Ingestion** | Accept PDF documents only (up to 10 MB). Enforce size and extension limits on client and server. Extract digital text page-by-page. | [backend/app/routers/notices.py](file:///c:/Users/user/Notice2Action/backend/app/routers/notices.py)<br>[extraction/extractor.py](file:///c:/Users/user/Notice2Action/extraction/extractor.py)<br>[frontend/src/pages/NoticeUploadPage.jsx](file:///c:/Users/user/Notice2Action/frontend/src/pages/NoticeUploadPage.jsx) | `backend/tests/test_api.py::test_upload_validation_errors`<br>`extraction/tests/test_extractor.py` | **Done** |
| **FR-02** | **Document Readability & Early Refusal** | Refuse unreadable, empty, corrupted, encrypted, or scanned-only PDFs without calling LLM. Return status `needs_clearer_document`. | [extraction/extractor.py](file:///c:/Users/user/Notice2Action/extraction/extractor.py)<br>[extraction/pipeline.py](file:///c:/Users/user/Notice2Action/extraction/pipeline.py) | `extraction/tests/test_extractor.py::test_extract_pages_scanned_unreadable_handling`<br>`extraction/tests/test_pipeline.py::test_pipeline_unreadable_refusal_without_llm` | **Done** |
| **FR-03** | **Scope Filtering & Category Classification** | Classify into 5 supported categories (`scholarship_or_college`, `bank`, `utility`, `tax_or_payment`, `government_scheme`). Refuse unsupported documents early (`out_of_scope`) without calling LLM. | [extraction/classifier.py](file:///c:/Users/user/Notice2Action/extraction/classifier.py)<br>[extraction/pipeline.py](file:///c:/Users/user/Notice2Action/extraction/pipeline.py) | `extraction/tests/test_classifier.py`<br>`extraction/tests/test_pipeline.py::test_pipeline_out_of_scope_refusal_without_llm` | **Done** |
| **FR-04** | **Structured LLM Extraction & Self-Repair** | Schema-constrained extraction (temperature 0). Automatic self-repair retry loop (up to 2 retries) on JSON syntax or schema errors. Flag relative/ambiguous dates with `is_ambiguous_or_conflicting: true`. | [extraction/llm_extractor.py](file:///c:/Users/user/Notice2Action/extraction/llm_extractor.py)<br>[extraction/pipeline.py](file:///c:/Users/user/Notice2Action/extraction/pipeline.py) | `extraction/tests/test_pipeline.py::test_pipeline_retry_and_repair`<br>`extraction/tests/test_pipeline.py::test_pipeline_missing_deadline_is_not_found` | **Done** |
| **FR-05** | **Verbatim Evidence Grounding & Zero Hallucination** | Every critical claim (deadline, doc, step, channel, penalty) must have verbatim evidence quote and valid source page. Unverified quotes marked `uncertain` with warning. Zero unsupported critical instructions. | [validation/validator.py](file:///c:/Users/user/Notice2Action/validation/validator.py)<br>[extraction/pipeline.py](file:///c:/Users/user/Notice2Action/extraction/pipeline.py)<br>[evaluation/metrics.py](file:///c:/Users/user/Notice2Action/evaluation/metrics.py) | `validation/tests/test_validator.py`<br>`extraction/tests/test_pipeline.py::test_pipeline_hallucinated_quote_flagged`<br>`tests/test_evaluation_metrics.py` | **Done** |
| **FR-06** | **Document Checklist Management** | Explicitly segregate mandatory (`is_required: true`) from optional documents. Checklist state tracking (`not_completed`, `completed`, `needs_verification`) with PATCH updates and audit history. | [backend/app/models/notice.py](file:///c:/Users/user/Notice2Action/backend/app/models/notice.py)<br>[backend/app/routers/notices.py](file:///c:/Users/user/Notice2Action/backend/app/routers/notices.py)<br>[frontend/src/components/DocumentChecklist.jsx](file:///c:/Users/user/Notice2Action/frontend/src/components/DocumentChecklist.jsx) | `backend/tests/test_api.py::test_checklist_patch_and_validation`<br>`frontend/src/tests/dashboard.test.jsx` | **Done** |
| **FR-07** | **Sequential Action Steps & Channel** | Chronologically ordered compliance steps strictly derived from text. Primary submission channel identified with verbatim evidence citation. | [schemas/notice_output.schema.json](file:///c:/Users/user/Notice2Action/schemas/notice_output.schema.json)<br>[frontend/src/components/ActionSteps.jsx](file:///c:/Users/user/Notice2Action/frontend/src/components/ActionSteps.jsx)<br>[frontend/src/components/SubmissionChannel.jsx](file:///c:/Users/user/Notice2Action/frontend/src/components/SubmissionChannel.jsx) | `validation/tests/test_phase1_samples.py`<br>`frontend/src/tests/dashboard.test.jsx` | **Done** |
| **FR-08** | **Interactive Citizen Dashboard** | High-contrast, mobile-responsive dashboard featuring countdown deadline cards, uncertainty warning banners, document checklist, and action steps. | [frontend/src/pages/NoticeDashboardPage.jsx](file:///c:/Users/user/Notice2Action/frontend/src/pages/NoticeDashboardPage.jsx)<br>[frontend/src/components/DeadlineCard.jsx](file:///c:/Users/user/Notice2Action/frontend/src/components/DeadlineCard.jsx)<br>[frontend/src/components/WarningBanner.jsx](file:///c:/Users/user/Notice2Action/frontend/src/components/WarningBanner.jsx) | `frontend/src/tests/dashboard.test.jsx`<br>`frontend/src/tests/upload.test.jsx` | **Done** |
| **FR-09** | **Reminders & Deadline Management** | Full CRUD reminder scheduling linked to notice deadlines (`remind_on`, `note`, `done`). Filter by upcoming/pending reminders and toggle completion state. | [backend/app/models/reminder.py](file:///c:/Users/user/Notice2Action/backend/app/models/reminder.py)<br>[backend/app/routers/reminders.py](file:///c:/Users/user/Notice2Action/backend/app/routers/reminders.py)<br>[frontend/src/components/RemindersSection.jsx](file:///c:/Users/user/Notice2Action/frontend/src/components/RemindersSection.jsx) | `backend/tests/test_api.py::test_reminder_crud_and_upcoming_filter`<br>`frontend/src/tests/dashboard.test.jsx` | **Done** |
| **FR-10** | **Passage Viewer & Evidence Traceability** | "See in notice" modal/drawer displaying normalized source page text with highlighted verbatim evidence quotes for citizen verification. | [backend/app/routers/notices.py](file:///c:/Users/user/Notice2Action/backend/app/routers/notices.py)<br>[frontend/src/components/PassageViewerModal.jsx](file:///c:/Users/user/Notice2Action/frontend/src/components/PassageViewerModal.jsx) | `backend/tests/test_api.py::test_page_text_and_missing_page_404`<br>`frontend/src/tests/sourceViewer.test.jsx` | **Done** |

---

## 2. In-Scope vs. Out-of-Scope Integrity Audit

As mandated by Section 2 of the PRD and rules.md, the application strictly adheres to the MVP boundaries:

- **Third-Party Form Submission**: Strictly excluded. The system generates structured checklists but never submits forms or logs into portals on behalf of users.
- **Automated Payments**: Strictly excluded. No payment gateway integration or direct debit trigger is supported.
- **Legal/Financial Advice**: Disclaimed. The system extracts factual instructions and verbatim quotes without generating advisory recommendations.
- **Image/Photo Direct Upload**: Strictly excluded. Non-PDF files are rejected on both client-side and server-side.
- **Messaging Integration (SMS/WhatsApp)**: Out of scope for MVP. In-app reminders and date scheduling are supported instead.
- **Language Scope**: English-language circulars only. Non-English circulars fall back to out-of-scope refusal or unreadable flagging.

---

## 3. Evaluation Target Traceability (PRD Section 9)

| Evaluation Metric | Target (PRD §9) | Harness Measurement Implementation | Status |
|---|---|---|---|
| Classification Accuracy | $\ge 90\%$ | `evaluation/metrics.py:aggregate_evaluation_results` | Implemented & verified via `evaluation/run_eval.py` |
| Critical Deadline Precision | $\ge 95\%$ | `evaluation/metrics.py:match_deadlines` (includes invented deadline flagging) | Implemented & verified via `evaluation/run_eval.py` |
| Required Action Precision | $\ge 85\%$ | `evaluation/metrics.py:match_fuzzy_items` (documents + action steps) | Implemented & verified via `evaluation/run_eval.py` |
| Required Action Recall | $\ge 85\%$ | `evaluation/metrics.py:match_fuzzy_items` (documents + action steps) | Implemented & verified via `evaluation/run_eval.py` |
| Unsupported Critical Instructions | **0** | `evaluation/metrics.py:check_grounding_and_unsupported` | Implemented & verified via `evaluation/run_eval.py` |
| Maximum Processing Time | $\le 60.0\text{s}$ | `evaluation/metrics.py:aggregate_evaluation_results` (wall-clock latency) | Implemented & verified via `evaluation/run_eval.py` |
