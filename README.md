# Notice to Action 📑➡️⚡

> **Transforming confusing bureaucratic and administrative notices into clear, verified, actionable checklists with deadlines, reminders, and zero hallucinations.**

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-teal.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-purple.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-sky.svg)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

---

## 1. Core Promise & Capabilities

Official notices—such as municipal property tax demands, scholarship renewal mandates, bank KYC circulars, utility disconnection warnings, and government welfare announcements—are frequently dense, multi-page PDFs written in complex administrative jargon. Citizens and students routinely miss critical deadlines, assemble incomplete document packages, or suffer financial surcharges simply because administrative notices are hard to decipher.

**Notice to Action** solves this problem by processing complex official PDF circulars and providing:

- **Prominent Deadlines with Active Countdowns**: Clear identification of primary cutoffs and submission windows.
- **Mandatory vs. Optional Checklists**: Explicit segregation of mandatory attachments (`is_required: true`) from optional or conditional forms.
- **Sequential Action Steps**: Chronologically ordered compliance instructions derived directly from notice text.
- **Evidence-Linked Verifiability ("See in Notice")**: Every critical claim is backed by a verbatim quotation and 1-indexed source page citation. Clicking "See in notice" opens the original page text with the cited passage highlighted.
- **Zero Hallucination & Null-on-Absence**: Missing information defaults strictly to `null` with status `"not_found"`. Dates and instructions are never estimated or invented.
- **Uncertainty & Ambiguity Warnings**: Ambiguous timelines (e.g. "within 15 days of circular receipt" without an anchor date) and conflicting dates trigger high-visibility warning banners.

---

## 2. In-Scope vs. Explicit Exclusions (PRD Section 2)

To maintain strict reliability and security boundaries, **Notice to Action** enforces clear operational scopes:

### Supported In-Scope Categories & Trust Tiers

#### 1. Core Tested Tier (`trust_level: "tested"`)
1. **`tax_or_payment`**: Municipal property tax notices, assessment demands, advance tax alerts.
2. **`scholarship_or_college`**: Financial aid circulars, college renewal mandates, stipend applications.
3. **`bank`**: Account KYC refresh notices, dormancy warnings, re-KYC mandates.
4. **`utility`**: Electricity, water, or gas disconnection warnings, meter replacement notices.
5. **`government_scheme`**: Direct benefit transfer (DBT) registrations, subsidy application windows.

#### 2. General Mode (`trust_level: "general"`)
Official notices outside the 5 core categories are handled in general mode with mandatory verification banners:
6. **`insurance_or_health`**: Policy renewal dues, medical board directives, claim submission notices.
7. **`legal_or_court`**: Court summons, legal notices from advocates, statutory compliance directives.
8. **`employment`**: Civil service/employer circulars, appointment/deputation notices, wage notices.
9. **`other_official_notice`**: Any other actionable notice from a recognized authority.

*Note*: Non-actionable documents (recipes, flyers, marketing emails, personal letters) are categorized as `not_a_notice` and refused early with status `out_of_scope`.

### Explicit PRD Exclusions
- **No Third-Party Form Submission**: The system never logs into portals, files forms, or submits applications on behalf of the user.
- **No Automated Payments**: The system does not execute banking transactions, card debits, or payment gateway triggers.
- **No Legal or Financial Advice**: The system extracts verbatim factual directives and provides no advisory interpretations.
- **No Image/Photo Uploads**: Only PDF documents (up to 10 MB) are accepted. Standalone JPEG/PNG files without a PDF wrapper are rejected.
- **No Handwritten or Password-Protected Documents**: Degraded handwritten circulars and encrypted PDFs are refused early with guidance to upload a clear digital document.
- **Language Scope**: English-language circulars only. Non-English circulars fall back to out-of-scope refusal.

---

## 3. System Architecture

The following architecture illustrates the end-to-end processing pipeline, from client-side PDF ingestion through early refusal gates, LLM extraction with self-repair, evidence grounding, database persistence, and presentation in the React dashboard:

```mermaid
flowchart TD
    subgraph Client ["Frontend (React 18 + Vite + Tailwind)"]
        A[User Uploads PDF] --> B{Client-side Validation<br/>type: application/pdf<br/>size <= 10MB}
        B -- Invalid --> B1[Show Friendly Error Alert]
        B -- Valid --> C[Upload to FastAPI Backend]
        Z[Interactive Dashboard] <-- Poll / Fetch --> W[REST API Endpoints]
        Z --> PV[Passage Viewer Modal<br/>Highlighted Verbatim Quotes]
    end

    subgraph Backend ["FastAPI REST Service (Python 3.10+)"]
        C --> D[Save PDF via Storage Interface<br/>Local Disk / Cloud Storage]
        D --> E[Start Background Pipeline Task]
        W --> DB[(Database<br/>PostgreSQL / SQLite)]
    end

    subgraph Pipeline ["Processing & Extraction Pipeline"]
        E --> F[PyMuPDF Text Extraction<br/>Page-by-Page Digital Text]
        F --> G{Readability Guard<br/>Empty, corrupt, or scanned?}
        G -- Scanned/Unreadable --> G1[Refuse: needs_clearer_document<br/>NO LLM CALL]
        G -- Digital Text OK --> H{Rule-Based Classifier<br/>Fast First Guess}
        H -- Confident Tested >= 0.85 --> I[LLM Structured Extractor<br/>trust_level: tested]
        H -- Low Confidence / Other --> H2{LLM Triage Guard<br/>Pages 1-2 JSON Call}
        H2 -- not_a_notice --> H1[Refuse: out_of_scope<br/>Plain Reason]
        H2 -- Tested Category --> I
        H2 -- General Mode Cat --> I2[LLM Structured Extractor<br/>trust_level: general<br/>needs_verification: true]
        I2 --> J

        subgraph SelfRepair ["Self-Repair Retry Loop (Max 2 Retries)"]
            I --> J{Schema Valid &<br/>Valid JSON?}
            J -- Parse/Schema Error --> J1[Feedback Error to LLM<br/>Retry Extraction]
            J1 --> I
        end

        J -- Success --> K[Validator & Grounding Engine]
        K --> L{Verify Quotes Verbatim<br/>on declared source page}
        L -- Quote Missing --> L1[Mark field uncertain<br/>Add Warning, Flag Verification]
        L -- Quote Verified --> L2[Mark field verified]
        L1 --> M[Post-Processing & Date Normalization]
        L2 --> M
        M --> N[Store Record in Database<br/>status: success]
    end

    G1 --> DB
    H1 --> DB
    N --> DB
```

---

## 4. Quickstart & Setup (Windows PowerShell)

### Prerequisites
- Python 3.10 or higher
- Node.js 18+ and npm
- Windows PowerShell (or Git Bash)

### Backend Setup

1. **Clone the repository and enter the directory**:
   ```powershell
   git clone <repo-url>
   cd Notice2Action
   ```

2. **Create and activate a virtual environment**:
   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   ```

3. **Install Python dependencies**:
   ```powershell
   pip install -r backend/requirements.txt
   pip install -r requirements-dev.txt
   ```

4. **Initialize Environment Variables**:
   ```powershell
   Copy-Item .env.example .env
   ```
   *(Configure your `LLM_API_KEY` or `GEMINI_API_KEY` in `.env` if executing live extractions).*

5. **Initialize the Database**:
   - **For SQLite (Default Local Development)**:
     ```powershell
     python -m alembic upgrade head
     ```
   - **For Supabase PostgreSQL**:
     Configure `DATABASE_URL` in `.env` and run:
     ```powershell
     python -m alembic upgrade head
     ```

6. **Start the FastAPI Backend Server**:
   ```powershell
   $env:DISABLE_SQLALCHEMY_C_EXTENSIONS="1"
   python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *The interactive Swagger OpenAPI documentation is available at `http://localhost:8000/docs`.*
   *Verify health and database status at `http://localhost:8000/api/health`.*

---

### Supabase & PostgreSQL Setup Guide

Notice to Action supports both SQLite (default for fast local development and tests) and Supabase PostgreSQL (for production and staging).

#### 1. Create a Supabase Project
1. Log in to [supabase.com](https://supabase.com) and click **New Project** (or visit [database.new](https://database.new)).
2. Name your project (e.g. `notice-to-action`), select your nearest geographic region, and choose a strong database password (keep this password saved).

#### 2. Retrieve Connection Details
1. In the Supabase Dashboard, go to **Project Settings** (gear icon) -> **Database**.
2. Scroll to the **Connection string** section and select **URI**.
3. Choose the **Connection Pooler** tab:
   - **Mode**: Session (Port `5432`) or Transaction (Port `6543`).
   - Copy the connection URI:
     `postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require`
4. Go to **Project Settings** -> **API** to copy:
   - **Project URL** (`https://[YOUR-PROJECT-REF].supabase.co`)
   - **anon public key**
   - **service_role secret key** *(Backend only - never expose this to frontend clients)*.

#### 3. Configure Environment Variables
Copy `.env.example` to `.env` and populate the values:
```ini
# Supabase PostgreSQL Connection
DATABASE_URL=postgresql+psycopg2://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require

# Supabase Credentials (Backend only)
SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Connection Pooling Configuration
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=10
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=1800
```
> [!NOTE]
> If `DATABASE_URL` is omitted or left as `sqlite:///./notice.db`, the application defaults safely to SQLite. No code changes are required to switch between SQLite and Supabase.

#### 4. Run Database Migrations
Apply all schema tables and columns to your Supabase PostgreSQL instance:
```powershell
python -m alembic upgrade head
```

#### 5. Verify Database Connectivity
Start the server and check the health endpoint:
```powershell
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
Make a request to `GET /api/health`:
```json
{
  "status": "healthy",
  "database": "connected",
  "app": "Notice to Action API",
  "version": "1.0.0",
  "environment": "development",
  "database_type": "postgresql",
  "supabase_configured": true
}
```
If the database connection is unreachable, the endpoint returns `503 Service Unavailable` with `status: "unhealthy"` and exact failure diagnostics without reporting false healthy states.

### Frontend Setup

1. **Enter the frontend directory and install npm packages**:
   ```powershell
   cd frontend
   npm install
   ```

2. **Configure Frontend Environment**:
   ```powershell
   Copy-Item .env.example .env
   ```
   *Ensure `VITE_API_BASE_URL=http://localhost:8000` is configured in `frontend/.env`.*

3. **Start the Vite Development Server**:
   ```powershell
   npm run dev
   ```
   *Open your browser and navigate to `http://localhost:5173`.*

### Production Deployment Guide (Render + Vercel + Supabase)

Notice to Action is configured for a modern, decoupled production architecture:

```
[ User Browser ]
       |
       +---> [ Frontend (Vercel) ] --- Static Vite React SPA
       |            |
       |      (API Calls with CORS)
       |            v
       +---> [ Backend (Render / Docker) ] --- FastAPI + PyMuPDF + LLM Extractor
                    |
                    v
             [ Supabase PostgreSQL ] --- Pooled Database & Alembic Migrations
```

#### 1. Database Provisioning (Supabase)
- Create a Supabase project and copy the connection pooler URI (`aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require`).
- Retrieve the `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

#### 2. Backend Deployment (Render or Docker)
- **Repository Setup**: Connect your repository to [Render](https://render.com).
- **Service Type**: Web Service (Python) or deploy via `render.yaml` blueprint.
- **Build Command**: `pip install -r backend/requirements.txt`
- **Start Command**: `python -m alembic upgrade head && uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
- **Health Check Path**: `/api/health`
- **Required Environment Variables**:
  - `DATABASE_URL`: Your Supabase PostgreSQL pooled URI (`postgresql+psycopg2://...`).
  - `SUPABASE_URL`: `https://[project-ref].supabase.co`
  - `SUPABASE_ANON_KEY`: Supabase anon key
  - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (backend only)
  - `LLM_API_KEY`: Google Gemini API Key
  - `LLM_PROVIDER`: `gemini`
  - `LLM_MODEL`: `gemini-1.5-flash`
  - `ALLOWED_ORIGINS`: Comma-separated list containing your Vercel frontend domain (e.g. `https://notice-to-action.vercel.app`).
  - `MAX_UPLOAD_MB`: `10`
  - `DISABLE_SQLALCHEMY_C_EXTENSIONS`: `1`
- **Container Alternative**: Use the included root [`Dockerfile`](file:///c:/Users/nihal/noticeproject/Notice2Action/Dockerfile) with any standard container host (Railway, Fly.io, AWS ECS, Google Cloud Run).

#### 3. Frontend Deployment (Vercel)
- **Repository Setup**: Import the repository into [Vercel](https://vercel.com).
- **Root Directory**: `frontend`
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Routing**: Handled by [`frontend/vercel.json`](file:///c:/Users/nihal/noticeproject/Notice2Action/frontend/vercel.json) (routes all client-side paths to `/index.html`).
- **Environment Variables**:
  - `VITE_API_BASE_URL`: Full public URL of your deployed backend (e.g. `https://notice-to-action-api.onrender.com`).
  - **Security Rule**: Never configure `SUPABASE_SERVICE_ROLE_KEY` or `LLM_API_KEY` on Vercel.

#### 4. Post-Deployment Verification
Once both services are provisioned:
1. Verify backend health:
   `curl https://notice-to-action-api.onrender.com/api/health`
   Ensure response shows `"status": "healthy"` and `"database": "connected"`.
2. Open the frontend in your browser: `https://notice-to-action.vercel.app`.
3. Upload an actionable notice PDF to verify the end-to-end processing pipeline, progress bar updates, checklist rendering, and calendar `.ics` download.

---

## 5. Environment Variables Reference

| Variable Name | Default Value | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./notice.db` | SQLAlchemy connection string (SQLite for local, Supabase PostgreSQL for production). |
| `STORAGE_BACKEND` | `local` | File storage provider interface (`local` for disk storage, `supabase` for cloud object storage). |
| `UPLOAD_DIR` | `./uploads` | Private server directory for uploaded PDF storage (outside public web root). |
| `MAX_UPLOAD_MB` | `10` | Maximum upload file size in megabytes (default 10 MB). Oversized files return HTTP 413. |
| `RATE_LIMIT_UPLOAD_MAX` | `10` | Maximum number of upload requests allowed per client IP within the rate-limit window. |
| `RATE_LIMIT_UPLOAD_WINDOW_SEC` | `60` | Duration of the sliding rate-limit window in seconds (default 60s). Exceeding requests return HTTP 429. |
| `RATE_LIMIT_ENABLED` | `True` | Master toggle to enable or disable upload rate limiting. |
| `LLM_PROVIDER` | `gemini` | LLM client provider (`gemini`, `openai`, or `fake`). |
| `LLM_API_KEY` | *(None)* | API secret key for LLM provider (Google Gemini or OpenAI). |
| `LLM_MODEL` | `gemini-1.5-flash` | LLM model identifier. |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API base URL consumed by React frontend client. |
| `DISABLE_SQLALCHEMY_C_EXTENSIONS` | `1` | Disables compiled C extensions on Windows systems with strict binary execution policies. |

---

## 5.1 Upload Security & Rate Limiting Architecture

Notice to Action implements multi-layer defense-in-depth for document ingestion:

1. **Content & Extension Verification**:
   - Extension must strictly be `.pdf`. Non-PDF extensions (`.exe`, `.sh`, `.docx`, `.txt`) are rejected with `HTTP 400 (INVALID_FILE_TYPE)`.
   - MIME header validation allows only `application/pdf`, `application/x-pdf`, or binary streams.
   - Deep content inspection verifies the binary starts with the standard `%PDF-` magic bytes header; disguised or corrupted files are rejected with `HTTP 422 (INVALID_MAGIC_BYTES)`.
   - Empty files (0 bytes) are rejected early with `HTTP 400 (EMPTY_FILE)`.

2. **Path Traversal & Safe Filename Handling**:
   - Filenames containing path traversal sequences (`../`, `..\\`, `/`, `\`) are rejected with `HTTP 400 (UNSAFE_FILENAME)`.
   - The original user filename is kept strictly as metadata for display. On disk, files are persisted with collision-free, randomized UUID names (`<uuid4>.pdf`).
   - Storage writes verify that resolved paths reside strictly within the designated private directory (`UPLOAD_DIR`). Files cannot overwrite existing documents.

3. **Private Storage Isolation**:
   - Stored files reside outside any static web server root. Direct access through static URLs (e.g. `/uploads/file.pdf`) is disabled and returns `HTTP 404`.
   - File downloads are controlled exclusively via `GET /api/notices/{id}/file`, requiring a valid database notice record.

4. **Rate Limiting & Production Considerations**:
   - An in-memory sliding-window limiter tracks client IPs (via `X-Forwarded-For` or direct connection).
   - Exceeding `RATE_LIMIT_UPLOAD_MAX` within `RATE_LIMIT_UPLOAD_WINDOW_SEC` returns `HTTP 429 Too Many Requests` with a `Retry-After` header.
   - **Multi-Worker Note**: The built-in in-memory rate limiter is node-local (in-process). In multi-worker (e.g. Gunicorn/Uvicorn cluster) or multi-container deployments, rate counters are maintained per worker process. For high-scale distributed deployments requiring synchronized global quotas, deploy an external Redis cache (e.g., SlowAPI with Redis) or enforce limits at an upstream API Gateway / Reverse Proxy (e.g. Cloudflare, Nginx, or AWS WAF/ALB).

---

## 6. Testing & Evaluation Harness Commands

### Running Backend & Extractor Unit Tests
Run the complete suite of 71 unit and integration tests across API routes, extraction pipelines, validators, and evaluation metrics:
```powershell
$env:DISABLE_SQLALCHEMY_C_EXTENSIONS="1"
python -m pytest -v
```

### Running Frontend Tests & Linting
Run component unit tests and ESLint in the `frontend/` directory:
```powershell
cd frontend
npm test
npm run lint
npm run build
cd ..
```

### Validating Ground-Truth Annotations
Verify that all test suite annotations conform strictly to JSON Schema and verify that all evidence quotes exist verbatim in the source PDFs:
```powershell
python scripts/validate_annotations.py
```

### Running the Evaluation Benchmark
Run the automated evaluation benchmark against ground-truth annotations in `data/annotations/`:

- **Deterministic Offline Evaluation** (No API key needed, uses reproducible canned models):
  ```powershell
  python evaluation/run_eval.py --fake
  ```

- **Live Evaluation with Real LLM**:
  ```powershell
  python evaluation/run_eval.py
  ```

- **Force Cache Refresh**:
  ```powershell
  python evaluation/run_eval.py --refresh
  ```

### Inspecting Benchmark Failures Side-by-Side
Display side-by-side expected vs. predicted comparisons with source passages for any failing notice:
```powershell
python scripts/show_failures.py
```

---

## 6.1 Continuous Integration (GitHub Actions CI Workflow)

Notice to Action includes an automated GitHub Actions CI workflow ([`.github/workflows/ci.yml`](file:///c:/Users/nihal/noticeproject/Notice2Action/.github/workflows/ci.yml)) configured to run on every commit and pull request.

### What the Workflow Checks

The workflow executes two independent, parallel jobs:

1. **`backend-checks` (Python 3.11 on Ubuntu)**:
   - Sets up Python 3.11 with `pip` dependency caching across all requirements files.
   - Installs backend, extraction, and validation requirements.
   - Runs `python -m ruff check backend/` for linting and code quality verification.
   - Runs `python -m pytest backend/tests/ -v` using isolated in-memory SQLite storage (no remote Supabase credentials required).
2. **`frontend-checks` (Node.js 20 on Ubuntu)**:
   - Sets up Node.js 20 with `npm` dependency caching bound to `package-lock.json`.
   - Performs clean, deterministic package installation via `npm ci`.
   - Executes the full Vitest unit test suite via `npm test`.
   - Compiles the production Vite bundle via `npm run build`.

### Trigger Events

- **Pushes**: Automatically triggers on pushes to any branch (`**`).
- **Pull Requests**: Automatically triggers on PRs targeting `main`.

### How to View Workflow Results in GitHub

1. Navigate to your repository on GitHub.
2. Click the **Actions** tab in the top navigation bar.
3. Select the latest run under **CI**.
4. Click on either `Backend Lint & Tests` or `Frontend Tests & Build` to expand real-time execution steps and terminal logs.

### What a Failed Check Means

- **Red X on Pull Request**: Merging is blocked until the underlying failure is resolved.
- **Backend Failure**: Indicates a syntax/style violation caught by Ruff, or an assertion failure in the API/service/database tests.
- **Frontend Failure**: Indicates a Vitest test regression, or a broken import/asset in the Vite production bundle.
- **Local Diagnosis**: Reproduce CI checks locally before pushing:
  ```powershell
  # Backend verification
  python -m ruff check backend/
  python -m pytest backend/tests/ -v

  # Frontend verification
  cd frontend
  npm test
  npm run build
  ```

---

## 7. REST API Overview

All API endpoints are prefixed with `/api` and return standardized JSON error envelopes on failure:

- **Health Check**:
  - `GET /api/health` — Returns system status, storage configuration, and executes `SELECT 1` on the database.
- **Notice Ingestion**:
  - `POST /api/notices/upload` — Accepts multipart PDF upload; performs file safety validation and starts async extraction pipeline.
- **Notice Management**:
  - `GET /api/notices` — Lists all uploaded notices with status, category, and date.
  - `GET /api/notices/{id}` — Retrieves detailed notice record, extracted JSON result, and verification flags.
  - `GET /api/notices/{id}/status` — Lightweight polling endpoint returning real-time processing stage, progress percentage, and error messages.
  - `POST /api/notices/{id}/retry` — Safe retry endpoint to re-queue failed or timed-out notices without re-uploading.
  - `GET /api/notices/{id}/file` — Controlled-access download of the original uploaded PDF file.
  - `GET /api/notices/{id}/calendar` — Generates and downloads an RFC 5545 compliant `.ics` calendar file with confirmed deadlines and reminder alarms.
  - `DELETE /api/notices/{id}` — Removes notice database record and deletes stored PDF from disk.
- **Checklist Interactivity**:
  - `PATCH /api/notices/{id}/checklist/{item_index}` — Updates document checklist status (`completed`, `not_completed`, `needs_verification`).
- **Reminders**:
  - `GET /api/notices/{id}/reminders` — Lists reminders associated with notice.
  - `POST /api/notices/{id}/reminders` — Creates a new deadline reminder (`remind_on`, `note`).
  - `PATCH /api/reminders/{id}` — Updates reminder completion state (`done: true/false`).
  - `DELETE /api/reminders/{id}` — Deletes reminder record.
- **Passage Viewer**:
  - `GET /api/notices/{id}/pages/{page}` — Returns raw normalized text for specified 1-indexed page for client-side quote highlighting.

---

## 7.1 Calendar Export (.ics) & Client Integration

Notice to Action provides standard **iCalendar (`.ics`)** file generation conforming to **RFC 5545**. This allows citizens and students to add official compliance deadlines directly to their digital calendars with automatic reminders.

### Endpoint Specification

- **Method**: `GET`
- **Path**: `/api/notices/{notice_id}/calendar`
- **Response Format**: `text/calendar; charset=utf-8`
- **Headers**:
  - `Content-Disposition: attachment; filename="notice-{notice_id}.ics"`
  - `Cache-Control: no-cache`

### Example Request

```powershell
# Download notice deadlines using curl
curl -O -J "http://localhost:8000/api/notices/f47ac10b-58cc-4372-a567-0e02b2c3d479/calendar"

# Or invoke directly via web browser / JavaScript
window.location.href = `/api/notices/${noticeId}/calendar`;
```

### Calendar Content & RFC 5545 Compliance

Each event (`VEVENT`) generated in the `.ics` file contains:
- **SUMMARY**: Notice title and specific deadline action (e.g. `Scholarship Renewal Notice: Submit semester grade transcripts`).
- **DESCRIPTION**: Complete context including issuing authority, notice purpose, source page citation, evidence quotation from the document, and notice ID.
- **UID**: Globally unique identifier (`{notice_id}-deadline-{index}@noticetoaction.app`).
- **VALARM (Reminder Alarm)**: Standard display alarm set to trigger **1 day before the deadline** (`TRIGGER:-P1D`).
- **Line Folding**: Automatically folded at **75 octets** with leading whitespace on continuation lines (`\r\n `) per RFC 5545 §3.1.
- **Line Endings**: Strict standard CRLF (`\r\n`) across all records.
- **Special Character Escaping**: Semicolons (`;`), commas (`,`), backslashes (`\`), and newlines (`\n`) are escaped according to RFC 5545 §3.3.11.

### Date & Timezone Handling

1. **Date-Only Deadlines (All-Day Events)**:
   - When the notice specifies a date without an explicit time (e.g. `"2026-05-30"`), the event is exported as an all-day event using `DTSTART;VALUE=DATE:20260530` and `DTEND;VALUE=DATE:20260531` (exclusive next-day end per RFC 5545 §3.6.1).
2. **UTC-Anchored Datetimes**:
   - Dates with explicit UTC indicators (e.g. `"2026-05-30T17:00:00Z"` or timezone offset) are normalized to UTC and end with the standard `Z` designator.
3. **Floating Local Datetimes**:
   - Datetimes without an explicit timezone (e.g. `"2026-05-30T17:00:00"`) are emitted as **floating local time** (RFC 5545 §3.3.5) without `Z`. An explicit note is added to the event description: `Timezone: Floating (local time; notice did not specify a timezone)`.
4. **Missing or Uncertain Dates**:
   - The system **never invents missing or uncertain dates**. If a deadline has status `"uncertain"`, `"not_found"`, or unparseable text, it is omitted from calendar generation. If a notice has no valid confirmed deadlines, the endpoint returns `HTTP 400 Bad Request` with error code `NO_CALENDAR_EVENTS`.

### How to Import into Calendar Applications

- **Google Calendar**:
  1. Open [Google Calendar](https://calendar.google.com/).
  2. Click the gear icon (**Settings**) in the top right > **Settings**.
  3. In the left menu, select **Import & export** > **Import**.
  4. Select the downloaded `notice-{id}.ics` file, choose the destination calendar, and click **Import**.
- **Microsoft Outlook (Desktop & Web)**:
  - *Desktop*: Double-click the downloaded `.ics` file, or drag and drop it into Outlook Calendar; select **Save & Close** or **Open as New Calendar**.
  - *Web (Outlook.com)*: Go to Calendar > **Add calendar** > **Upload from file** > browse to `notice-{id}.ics` > click **Import**.
- **Apple Calendar (macOS & iOS)**:
  - *macOS*: Double-click the downloaded `.ics` file; Apple Calendar will prompt you to select a target calendar (e.g. Work, Home) and click **OK**.
  - *iOS*: Open the downloaded `.ics` link or attachment in Safari or Mail; tap **Add All** in the top right to add events and alarms to your iPhone calendar.

### Timezone & Reminder Limitations

- **Floating Time Behavior**: In most administrative circulars, deadlines specify dates or times without mentioning a standard timezone (e.g. "by 5:00 PM on 15th April"). Because Notice to Action adheres to a strict zero-hallucination policy, we do not guess or inject an arbitrary regional timezone. The event is treated as floating local time in whatever timezone the user's calendar operates.
- **Alarm Customization**: Reminder alarms are standardized to 24 hours prior (`-P1D`). Users wanting custom intervals (e.g., 1 week, 2 hours) can adjust alarm offsets within their calendar app after import.

---

## 8. Benchmark Evaluation Results

All evaluation metrics are calculated objectively by `evaluation/run_eval.py` according to PRD Section 9 criteria. Raw model outputs are cached in `evaluation/cache/` and results are written to `evaluation/results/latest.json`.

> [!NOTE]
> Please refer to the full evaluation benchmark report at:
> **[evaluation/results/report.md](file:///c:/Users/user/Notice2Action/evaluation/results/report.md)**  
> This report contains honest, unedited measurements on the test suite (classification accuracy, deadline precision, required action recall, zero unsupported critical claims, and processing latency) without invented figures.

---

## 9. Known Limitations & Roadmap

- **OCR Scope**: Basic OCR fallback is provided via Tesseract when available; degraded, low-resolution handwritten notices are safely refused (`needs_clearer_document`).
- **Multilingual Support**: MVP scope is strictly English administrative circulars. Multi-language and regional dialect support (Hindi, regional state circulars) is planned for Phase 7.
- **Browser Push Notifications**: Reminders currently track scheduled dates within the application dashboard and export to `.ics` files. Web Push notifications are slated for upcoming releases.

---

## 10. Contributors & License

Built with care by **Team Action4AI**.  
Licensed under the [MIT License](LICENSE).
