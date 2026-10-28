# Notice to Action - 5-Minute Live Demo Script

This document provides a timed, step-by-step presentation script for demonstrating **Notice to Action** to reviewers, stakeholders, and hackathon judges.

---

## Demo Overview

- **Total Duration**: 4 to 5 minutes
- **Core Value Proposition**: Transforming complex, intimidating administrative PDF circulars into clear, evidence-linked action plans with deadlines, checklists, reminders, and zero hallucinations.
- **Key Differentiator**: Verifiable evidence traceability ("See in notice") linking every critical claim directly to source page text.

---

## Timeline & Spoken Script

### 0:00 – 0:45 | The Problem & Value Proposition

> **Speaker**:  
> *"Every citizen, student, and small business owner knows the dread of receiving an official circular—whether it's a municipal tax demand, a scholarship renewal mandate, or a utility alert. They are written in dense bureaucratic legalese, spread across multiple pages, and buried in administrative circulars.*  
>  
> *People routinely miss critical cutoffs, fail to gather the right documents, or pay heavy penal surcharges simply because administrative notices are hard to decipher.*  
>  
> *Notice to Action solves this. It ingests complex official PDFs and transforms them into an evidence-linked action plan: primary deadlines with countdowns, mandatory document checklists, sequential steps, and direct citations back to the source text."*

---

### 0:45 – 1:45 | Ingestion & Smart Refusal Guards

> **Action**: Navigate to `http://localhost:5173/` (Upload Screen).  
> **Speaker**:  
> *"Let's upload a sample official circular. Notice to Action supports PDFs up to 10 MB.*  
>  
> *Before we call any AI model, the system executes two critical safety checks:*  
> *1. Readability Check: If a document is a degraded or unreadable scan with no digital text, the system immediately refuses early with `needs_clearer_document`, rather than hallucinating.*  
> *2. Scope Check: If someone uploads a recipe, lease agreement, or an unrelated document, our rule-based classifier catches it in milliseconds and refuses it with `out_of_scope` without wasting a single LLM token.*  
>  
> *Now, let's drag and drop our official Municipal Property Tax Demand notice."*  
>  
> **Action**: Drop `tests/fixtures/tax_or_payment.pdf` (or upload via picker). Watch the progress state change: "Reading your notice..." -> "Classifying document..." -> "Extracting deadlines & checklists...".

---

### 1:45 – 2:45 | The Action Plan Dashboard

> **Action**: The dashboard loads for the processed notice.  
> **Speaker**:  
> *"Here is our generated Action Plan Dashboard. Instead of wading through pages of legal prose, the citizen immediately sees:*  
>  
> *1. Prominent Deadlines: The primary cutoff is highlighted with an active countdown badge (e.g. 'Paid on or before 31-12-2026').*  
> *2. Submission Channel: A dedicated banner specifies exactly where to submit or pay—both the online municipal portal and physical Citizen Service Centers.*  
> *3. Plain-Language Summary: Broken down into five simple questions: What is this? Why does it matter? What to do? Where to do it? And what happens if the deadline is missed?*  
> *4. Mandatory Document Checklist: Clear distinction between mandatory documents (like the statutory tax challan and PID card) and optional attachments. Citizens can check off items as they prepare them, persisting state to our backend database."*

---

### 2:45 – 3:45 | Evidence Grounding & "See in Notice"

> **Action**: Click the `"See in notice"` link on the deadline card or a document item. The Passage Viewer modal opens, displaying Page 1 with the exact sentence highlighted.  
> **Speaker**:  
> *"This brings us to the core reliability feature of Notice to Action: Zero Hallucination via Evidence Grounding.*  
>  
> *Every single critical claim—every deadline, penalty clause, and required document—must have a verbatim quotation linking directly to its source page in the PDF.*  
>  
> *When a citizen clicks 'See in notice', Notice to Action opens the exact page text and highlights the original sentence. If the AI model ever extracts a claim that cannot be verified character-for-character against the document text, our validator automatically flags it with an amber 'Needs Verification' banner.*  
>  
> *We never invent dates or guess missing information: if a field is absent, it defaults strictly to `null` with status `not_found`."*

---

### 3:45 – 4:30 | Reminders & Evaluation Harness

> **Action**: Scroll down to the Reminders section. Click "Add Reminder" for a deadline, pick a reminder date, and save.  
> **Speaker**:  
> *"Citizens can also schedule actionable reminders directly linked to notice deadlines, allowing them to track upcoming compliance windows effortlessly.*  
>  
> *Behind the scenes, the entire system is governed by a rigorous evaluation harness aligned with PRD Section 9 targets. Our test suite measures classification accuracy, deadline precision, required action recall, processing latency, and validates that unsupported critical instructions remain strictly at zero."*

---

### 4:30 – 5:00 | Conclusion & Q&A

> **Speaker**:  
> *"Notice to Action transforms intimidating administrative documents into accountable, verified civic action plans—empowering citizens and students to act on time, with confidence. Thank you, and I look forward to your questions."*

---

## Fallback & Recovery Procedures

If unforeseen issues arise during a live presentation, use the following tested fallbacks:

| Scenario | Fallback Procedure |
|---|---|
| **LLM Provider API Latency or Rate Limit** | Toggle `--fake` mode in the pipeline, or load the pre-extracted canonical sample notice (`http://localhost:5173/notices/sample` or select from existing notice history on the dashboard). |
| **Backend Service Offline** | Open Windows PowerShell in the project directory and run: <br>`$env:DISABLE_SQLALCHEMY_C_EXTENSIONS="1"; .venv\Scripts\python.exe -m uvicorn backend.app.main:app --port 8000 --reload` |
| **Frontend Dev Server Stopped** | In `frontend/` directory, run: <br>`npm run dev` |
| **Corrupted Test Database** | Re-initialize the clean local SQLite database: <br>`$env:DISABLE_SQLALCHEMY_C_EXTENSIONS="1"; .venv\Scripts\python.exe scripts/create_tables.py` |
| **Passage Viewer Fails to Load Text** | Show the verbatim `evidence_quote` banner displayed directly inside the modal as a reliable fallback. |
