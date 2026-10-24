# Notice to Action 📑➡️⚡

> **Team Action4AI**  
> AI app converting official notices (PDFs) into evidence-linked action plans with deadlines, document checklists, and uncertainty warnings.

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-teal.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-purple.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-sky.svg)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-lightgrey.svg)]()

---

## 1. Project Overview

Official notices—scholarship notifications, bank KYC mandates, utility alerts, tax payment orders, and government welfare schemes—are frequently buried in dense, multi-page PDFs. Citizens often miss critical dates or miss mandatory document attachments due to confusing bureaucratic phrasing.

**Notice to Action** processes complex PDF circulars and extracts:
- **Prominent Deadlines**: Highlighted primary submission milestones and windows.
- **Document Checklists**: Segregated into explicitly mandatory versus optional items.
- **Action Steps**: Sequential steps directly derived from notice text.
- **Evidence-Linked Verifiability**: Clickable "See in notice" links referencing exact page numbers and verbatim quotations.
- **Uncertainty Warnings**: Explicit flags for ambiguous timelines (e.g. "within 15 days"), conflicting dates, or degraded scans.

> [!IMPORTANT]
> All team members and contributors must review and abide by [rules.md](rules.md).

---

## 2. Monorepo Structure

```
Notice2Action/
├── frontend/             # React 18 + Vite + Tailwind CSS dashboard
│   ├── src/
│   │   ├── api/          # Environment-driven API client with mock fallbacks
│   │   ├── components/   # Header, DeadlineCard, EvidenceBadge, Checklist, ActionSteps
│   │   ├── mocks/        # Bundled sample notice JSON (schema v1.0 compliant)
│   │   ├── pages/        # Home page dashboard
│   │   └── index.css     # Tailwind styling directives
│   ├── package.json
│   └── vite.config.js
├── backend/              # Python FastAPI REST service
│   ├── app/
│   │   ├── main.py       # FastAPI application, CORS, health endpoint, error envelopes
│   │   ├── config.py     # Pydantic Settings reading from .env
│   │   ├── models/       # SQLAlchemy models
│   │   ├── routers/      # API v1 routes (/notices, /health)
│   │   └── services/     # NoticeService business logic & stubs
│   ├── tests/            # Test suite for health check & upload endpoints
│   └── requirements.txt
├── extraction/           # PDF text extraction, OCR fallback & LLM extraction package
│   ├── prompts/v1/       # Versioned immutable prompt templates
│   ├── tests/            # Extractor unit tests
│   └── extractor.py      # process_pdf(file_path) stub returning schema-valid JSON
├── validation/           # Rule-based validator and benchmark evaluation
│   ├── tests/            # Validator tests
│   ├── validator.py      # validate_notice(notice, page_texts) quote verification
│   └── evaluate.py       # Benchmark metrics calculator placeholder
├── schema/               # Shared JSON Schema contracts
│   ├── notice.schema.json # JSON Schema v1.0 (Single source of truth)
│   ├── sample_notice.json # Canonical mock notice matching schema
│   └── README.md         # Schema documentation and changelog
├── data/                 # Evaluation dataset
│   ├── raw/              # (Gitignored) Original raw PDF notices
│   ├── masked/           # Anonymised notices for committed test suite
│   └── annotations/      # Ground-truth JSON annotations
├── docs/                 # Architecture diagrams, PRD, and benchmark reports
│   ├── PRD.md
│   └── architecture.md
├── docker-compose.yml    # PostgreSQL database service container
├── .env.example          # Environment configuration template
├── Makefile              # Automation shortcuts
├── pyproject.toml        # Ruff linter and Pytest configuration
├── rules.md              # Engineering rules, AI reliability standards, git workflow
└── README.md
```

---

## 3. Prerequisites

- **Python**: Version `3.10+` (tested up to `3.14`)
- **Node.js**: Version `18+` (recommended: Node 20 or 24 LTS)
- **npm**: Version `9+`
- **Docker & Docker Compose**: (Optional, for PostgreSQL database)

---

## 4. Quickstart: Step-by-Step Run Instructions

### Step 1: Clone and Configure Environment

```bash
# Clone the repository
git clone <repo-url>
cd Notice2Action

# Create local environment file from template
cp .env.example .env
```

### Step 2: Database Storage (SQLite / Supabase PostgreSQL)

The backend supports both local SQLite and remote PostgreSQL (Supabase):

#### Option A: Local SQLite (Default)
Runs with zero setup out of the box:
```ini
DATABASE_URL=sqlite:///./notice.db
STORAGE_BACKEND=local
```

#### Option B: Supabase (PostgreSQL)
1. In your **Supabase Dashboard**, navigate to **Project Settings** ➡️ **Database** ➡️ **Connection string**.
2. Select the **Session pooler** string (IPv4-compatible, port 6543) or direct connection string, and set it in `.env` using the `postgresql+psycopg2://` scheme:
   ```ini
   DATABASE_URL=postgresql+psycopg2://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[YOUR-REGION].pooler.supabase.com:6543/postgres?sslmode=require
   STORAGE_BACKEND=local
   ```
3. Create the database tables (`notices`, `checklist_items`, `reminders`) using the setup script:
   ```bash
   python scripts/create_tables.py
   ```
   *The script verifies connection with `SELECT 1` and creates all schema tables automatically.*

4. Confirm database connectivity through the health endpoint:
   - Start the backend and query `GET /api/health`:
     ```bash
     curl http://localhost:8000/api/health
     ```
   - Expected response:
     ```json
     {
       "status": "healthy",
       "database": "connected",
       "app": "Notice to Action API",
       "version": "1.0.0",
       "environment": "development"
     }
     ```

### Step 3: Backend Setup (FastAPI)

1. Create and activate a Python virtual environment:
   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install backend dependencies (including PostgreSQL driver `psycopg2-binary`):
   ```bash
   pip install -r backend/requirements.txt
   ```

3. Configure Environment Variables in `.env`:
   - `DATABASE_URL`: SQLAlchemy connection URI (`sqlite:///./notice.db` or Supabase pooler URI).
   - `STORAGE_BACKEND`: `local` (default). Structures uploads behind the `FileStorage` interface.
   - `UPLOAD_DIR`: Private directory for saving uploaded PDFs with safe UUID filenames (default: `./uploads`).
   - `LLM_PROVIDER`: `gemini` (default) or `openai`.
   - `LLM_API_KEY`: API secret key (`GEMINI_API_KEY` or `OPENAI_API_KEY`). If omitted, uploads succeed and transition cleanly to `extraction_failed` with a helpful message.
   - `LLM_MODEL`: Target model (e.g., `gemini-1.5-flash` or `gpt-4o-mini`).
   - `CORS_ORIGINS`: Allowed CORS origins for the frontend (default: `http://localhost:5173`).

4. Launch the FastAPI server:
   ```bash
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. Verify health check and API documentation:
   - Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health) (runs `SELECT 1` on DB)
   - Interactive Swagger API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
   - ReDoc API docs: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Step 4: Frontend Setup (React + Vite + Tailwind)

1. Open a new terminal and navigate to `frontend/`:
   ```bash
   cd frontend
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173) in your browser. You will see the Notice to Action dashboard loaded with the canonical sample notice, with prominent deadline cards, evidence verification badges, and upload triggers.

---

## 5. Development Shortcuts via Makefile

The root `Makefile` provides one-line targets:

| Command | Action |
|---|---|
| `make install` | Installs Python requirements and frontend packages |
| `make run-backend` | Starts the FastAPI server on port 8000 |
| `make run-frontend` | Starts the Vite dev server on port 5173 |
| `make run-db` | Starts PostgreSQL container via Docker Compose |
| `make test` | Executes Pytest across backend, extraction, and validation |
| `make lint` | Runs Ruff on Python packages and ESLint on frontend |
| `make format` | Auto-formats code with Ruff and Prettier |

---

## 6. Testing and Validation

Run the test suite across all Python packages (all 60 unit and integration tests):
```bash
python -m pytest
```

Execute the validation evaluation benchmark:
```bash
python validation/evaluate.py --data-dir data/masked --annotations-dir data/annotations
```

---

## 7. Key Engineering Standards

- **Single Source of Truth**: All payloads comply with [`schema/notice.schema.json`](schema/notice.schema.json).
- **Core AI Reliability**: Zero hallucinations. If a fact is absent from the notice, return `null` with status `"not_found"`.
- **See [rules.md](rules.md)** for full documentation on Git workflow, branch conventions, team ownership, and AI prompt versioning.

---

## 8. Known Limitations (MVP Scope)

- **Single-User MVP (No Authentication Yet)**: Per-user authentication and authorization (ownership enforcement) are deferred to future production milestones. The codebase contains clear `# NOTE(ownership)` marker comments indicating exactly where per-user tenant and session ownership checks should be hooked up.
- **In-App Reminders Only**: Reminders are managed and queried via `/api/notices/{id}/reminders` and `/api/reminders/upcoming` for dashboard notifications. Automated push, email, SMS, and cron schedulers are not yet integrated.
- **Local Private Storage**: PDFs are persisted on the local filesystem in a private `UPLOAD_DIR` using UUIDs. S3/GCS blob storage will be introduced in future cloud deployments.
- **Language Scope**: Currently optimized for English-language official notices; non-English/vernacular notices are rejected early or flagged as requiring manual verification.
