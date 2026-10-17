# Team Action4AI: Project Rules & Engineering Guidelines

This document governs all architectural, engineering, AI reliability, and collaboration practices for **Notice to Action**. Every team member must read, understand, and strictly adhere to these rules.

---

## 1. Project Scope Rules

- **MVP Input Format**: PDF upload only.
- **Supported Notice Categories**:
  - `scholarship`: College/university financial aid circulars, renewal notices.
  - `bank`: KYC verification notices, dormant account alerts, mandate changes.
  - `utility`: Electricity, water, or municipal utility payment/disconnection notices.
  - `tax`: Advance tax reminders, municipal tax demands, compliance notices.
  - `govt_scheme`: Direct benefit transfer (DBT), subsidy schemes, welfare application windows.
  - *Any document outside these 5 categories must be classified as `unsupported`.*
- **Explicitly Out of Scope (MVP)**:
  - Auto-submitting forms or applications to third-party government/bank portals.
  - Executing automated payments or debit setups.
  - Providing legal or financial advisory advice.
  - Guaranteeing beneficiary eligibility.
  - Directly contacting administrative departments or nodal officers.
  - Image/photo upload directly (JPEG/PNG) without a PDF container.
  - Messaging channel integration (SMS, WhatsApp, Telegram).
  - Regional or vernacular languages (MVP scope is English language notices; non-English notices must be flagged).
- **Scope Discipline**: No new feature, endpoint, or scope creep without prior consensus from all four team members.

---

## 2. Core AI Reliability Rules (Non-Negotiable)

- **Zero Hallucination / Null-on-Absence**:
  Never invent, extrapolate, or estimate deadlines, documents, fees, penalty amounts, or action steps. If a piece of information is not explicitly found in the notice text, set its `value` to `null` and mark its `status` as `"not_found"`.
- **Evidence-Linked Verifiability**:
  Every critical field (deadline, required document, action step, submission channel, penalty/late fee) must include verbatim evidence (`{ "page": <int>, "quote": "<exact quote>" }`) or be marked with status `"uncertain"`.
- **Instruction Grounding**:
  Action steps must be extracted strictly from textual instructions in the notice, never from pre-trained world knowledge or assumptions.
- **Optional vs. Mandatory Documents**:
  Documents that are merely helpful or recommended, but not legally/procedurally required, must be labelled `"not required by the notice"` (`"explicitly_required": false`).
- **Date Ambiguity & Conflict Handling**:
  - Ambiguous or contradictory dates across pages must be explicitly flagged with status `"ambiguous"` or `"conflicting"`. They must never be silently resolved or guessed.
  - Relative deadlines (e.g. "within 15 days") where the base notice date is absent or unclear must be flagged as `"ambiguous"`, with `iso_date: null`.
- **Document Quality & Rejection**:
  The application must refuse or issue high-visibility warnings when a document is unreadable, incomplete, password-protected, or corrupted.
- **Reliability Target**:
  Zero unsupported critical instructions on the reviewed evaluation test suite.

---

## 3. Schema Contract Rules

- **Single Source of Truth**:
  [`schema/notice.schema.json`](schema/notice.schema.json) is the sole canonical specification across all modules (current version: `v1.0`).
- **Module Validation**:
  `backend/`, `frontend/`, `extraction/`, and `validation/` must all validate their payloads and state models against this contract.
- **Contract Governance**:
  Any modification to the schema requires:
  1. Unanimous approval from all four team members.
  2. Version number bump (e.g., `v1.0` -> `v1.1` or `v2.0`).
  3. A detailed changelog entry in [`schema/README.md`](schema/README.md).

---

## 4. Team Roles and Ownership

| Team Member | Folder Ownership | Primary Responsibilities |
|---|---|---|
| **Member 1** | `extraction/` | PDF text extraction, OCR fallback, LLM prompting pipeline, structured extraction. |
| **Member 2** | `backend/` | FastAPI REST services, PostgreSQL models, Alembic migrations, file validation, security. |
| **Member 3** | `frontend/` | React + Vite UI, Tailwind styling, accessibility, evidence viewer modals, mobile responsiveness. |
| **Member 4** | `validation/`, `data/`, `docs/` | Rule-based validator, evaluation suite, test set annotations, PRD, documentation. |

- **Boundary Enforcement**:
  Only edit another member's folder via a pull request where that folder's owner is an assigned reviewer.

---

## 5. Git Workflow

- **Branching Strategy**:
  - Never push directly to `main`.
  - Development merges into `dev`.
  - Feature branches branch off `dev` using the convention: `feature/<member>-<short-description>` (e.g., `feature/m2-upload-validation`).
- **Commit Format**:
  Conventional Commits format: `type(scope): message`
  - Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
  - Example: `feat(backend): add pdf mime-type validation`
- **Code Reviews**:
  Every PR must have at least 1 approval before merging. PR descriptions must state:
  1. What changed.
  2. Why the change was made.
  3. How it was tested.
- **Syncing**:
  Pull latest `dev` before starting work and rebase/merge conflicts locally.
- **PR Size**:
  Keep PRs focused, minimal, and reviewable (< 400 lines changed preferred).

---

## 6. Coding Standards

- **Python (`backend/`, `extraction/`, `validation/`)**:
  - Full type hints on all function signatures.
  - Formatting and linting via Ruff (`ruff check`, `ruff format`).
  - Google-style docstrings on all public classes and functions.
  - Pytest unit tests for all business logic, validators, and stubs.
- **Frontend (`frontend/`)**:
  - Functional React components with hooks.
  - Vanilla Tailwind CSS styling (no inline arbitrary CSS hacks).
  - No hard-coded API URLs; all URLs read from environment configuration (`import.meta.env`).
  - No secrets in client bundles.
  - ESLint and Prettier compliance with zero warnings.
- **Clean Code**:
  - No dead code, commented-out blocks, or unexplained `TODO`s.
  - Every `TODO` must explicitly specify an owner (e.g. `# TODO(member2): integrate S3 bucket`).
- **Error Handling**:
  - Handle errors gracefully at every boundary.
  - Expose plain-language friendly messages to users; never leak raw stack traces, database schemas, or system internals.

---

## 7. API Rules

- **Architecture**: RESTful, JSON-based.
- **Path Versioning**: Base path must be `/api/v1/*`.
- **Payload Contracts**: All responses follow `schema/notice.schema.json`.
- **Standardized Error Format**:
  All error responses (4xx, 5xx) must follow the standard envelope:
  ```json
  {
    "error_code": "ERROR_IDENTIFIER_STRING",
    "message": "Human-readable plain language message"
  }
  ```
- **Upload Policies**:
  - Accept `application/pdf` only (inspect magic bytes/MIME headers, not just `.pdf` filename extension).
  - Enforce file size limit defined by `MAX_UPLOAD_MB`.
  - Gracefully reject corrupted, encrypted, or password-protected PDF files with friendly error messages.
- **Frontend Decoupling**:
  Frontend must function smoothly against mock JSON until the live API endpoints are integrated.

---

## 8. Security and Privacy Rules

- **Zero Secrets in Version Control**:
  Never commit secrets, API keys, passwords, database credentials, or `.env` files. Only `.env.example` with non-functional placeholders may be committed.
- **Data Privacy**:
  Uploaded notices are private user records. They must not be publicly accessible, must be isolated per session/user, and must be permanently deletable upon request.
- **Transport & Storage Security**:
  Protect data in transit (HTTPS / TLS) and configure encrypted volumes at rest.
- **Sanitization of Repository Test Data**:
  All test documents committed to `data/` must be strictly anonymised:
  - Mask names, street addresses, phone numbers, email addresses, bank account numbers, Aadhaar/PAN/SSN numbers, and student registration IDs.
  - `data/raw/` is gitignored and must never contain real personal data in git history.
- **External AI Tool Safety**:
  Never upload or paste unredacted user documents into public AI web chats.

---

## 9. AI Prompt and Model Rules

- **Prompt Versioning**:
  All system and user prompts reside as versioned files in `extraction/prompts/vN/` (e.g., `v1/system_prompt.txt`).
- **Immutability of Released Prompts**:
  Never mutate a deployed prompt version in-place. Always increment to a new version folder (`v2/`, `v3/`) to maintain benchmark reproducibility.
- **Prompt Mandate**:
  Prompts must strictly instruct the model to:
  1. Output valid JSON only conforming to the schema.
  2. Quote verbatim source evidence for all extractions.
  3. Return `null` with status `"not_found"` when facts are not present.
- **Evaluation Traceability**:
  Every evaluation run must log prompt version, model identifier, and temperature.
- **Multi-layered Reliability**:
  Never trust a single LLM or OCR output alone; extraction, rule-based validation, and quote verification work in concert.

---

## 10. Testing and Evaluation Rules

- **Split Evaluation Dataset**:
  Test data is split into:
  - `dev-set`: Used for tuning extraction rules, prompt iteration, and error analysis.
  - `held-out test set`: Strictly sequestered; never tuned against or used during prompt writing.
- **Annotation Process**:
  Every test notice is annotated for category, deadline, documents, action steps, channels, verbatim passage quotes, and ambiguities. A second team member reviews a verification sample.
- **Benchmark Evaluation Targets**:
  - Category classification accuracy: $\ge 90\%$
  - Critical deadline precision: $\ge 95\%$
  - Action step precision & recall: $\ge 85\%$
  - Verbatim evidence grounding: $100\%$ on extracted critical elements
  - Unsupported critical instructions: **0**
  - Processing latency: $< 60\text{ seconds}$ per average notice
- **Continuous Evaluation**:
  Execute dev-set evaluation after every prompt or extraction pipeline modification, and record summary reports under `docs/`.
- **Required Test Scenarios**:
  - Clean digital PDF
  - Low-resolution scanned PDF
  - Multi-page circular (> 5 pages)
  - Conflicting dates across sections
  - Notice with no deadline mentioned
  - Poor/degraded scan
  - Out-of-scope document (receipt, invoice, brochure)
  - Misleading/buried critical instructions

---

## 11. UX and Accessibility Rules

- **Clarity First**:
  Use plain language, short sentences, readable typography, and high contrast. Design mobile-first.
- **Visual Hierarchy**:
  The primary critical deadline card must be the most visually prominent element on the dashboard.
- **Visibly Distinct Uncertainty States**:
  Uncertain, ambiguous, conflicting, and not-found states must be visually highlighted using contrasting warning badges (e.g., amber borders, caution badges) accompanied by a direct prompt: *"Please verify against original notice"*.
- **Traceable Sourcing**:
  Every deadline, document requirement, and action step must include a clickable *"See in notice"* link exposing page number and verbatim quotation.

---

## 12. Definition of Done (for Any Task)

A task or feature is marked **Done** only when:
1. Output conforms 100% to `schema/notice.schema.json`.
2. Automated tests (unit, integration, or validation) are written and passing.
3. Code formatting and linting pass (`ruff check`, `ruff format`, `npm run lint`).
4. No credentials, tokens, or personal data are exposed or committed.
5. Relevant documentation in `README.md` or `docs/` is updated.
6. Pull request is reviewed, approved by folder owner, and merged into `dev`.

---

## 13. Communication Rules

- **Daily Standup**: 15-minute daily sync to report progress, blockers, and next milestones.
- **Shared Task Board**: One centralized tracking board; all active cards updated daily.
- **Blocker Escalation**: Raise blockers on the same day they occur.
- **Contract Change Announcements**: Announce any proposed change to the schema, API shape, or directory layout in the team channel before initiating implementation.
