# Notice Schema Contract (v1.0)

This directory contains the canonical JSON Schema specification for **Notice to Action** (`team Action4AI`).

`notice.schema.json` is the **single source of truth** across all monorepo modules:
- `extraction/`: Outputs structured documents conforming strictly to this schema.
- `validation/`: Verifies extracted JSON against this schema and validates evidence quotes against document text.
- `backend/`: Validates incoming and outgoing payload contracts and persists compliant records.
- `frontend/`: Types UI components and renders evidence links, uncertainty badges, and action plans based on this schema.

---

## 1. Core Principles

1. **Evidence-Linked Verifiability**:
   Every critical field includes `value`, `evidence` (`{ "page": <int>, "quote": "<string>" }`), and `status` (`found | uncertain | not_found`).
2. **Zero Hallucination / Null-on-Absence**:
   If a piece of information is not present in the notice text, the `value` must be `null` and `status` must be `"not_found"`. Models and extractors must never guess or fabricate details.
3. **Explicit Labeling of Uncertainty**:
   - Dates that are ambiguous (e.g. "within 15 days" without reference date) or contradictory across pages are given status `"ambiguous"` or `"conflicting"`.
   - Documents that are recommended or optional are tagged with `"explicitly_required": false`.
4. **Action Steps Grounded in Evidence**:
   Every action step must be supported by an exact verbatim quote from the notice.

---

## 2. Field Reference

| Field | Type | Description |
|---|---|---|
| `notice_id` | `string` | Unique identifier (e.g. UUID) for this extraction run |
| `schema_version` | `string` | Currently `"1.0"` |
| `category` | `enum` | One of `scholarship`, `bank`, `utility`, `tax`, `govt_scheme`, `unsupported` |
| `category_confidence` | `number` | Float between `0.0` and `1.0` indicating category classification confidence |
| `title` | `EvidenceFieldString` | Official title or subject heading of the notice |
| `issuer` | `EvidenceFieldString` | Department, bank, university, or agency issuing the notice |
| `summary_plain` | `EvidenceFieldString` | Plain-language summary of what the notice entails |
| `affected_party` | `EvidenceFieldString` | Target recipient (e.g. "PG Scholarship Candidates", "Account Holder") |
| `deadlines[]` | `array` | Deadline items with `label`, `original_text`, `iso_date`, `evidence`, `status` (`found` \| `ambiguous` \| `conflicting` \| `not_found`) |
| `required_documents[]` | `array` | Document checklist with `name`, `explicitly_required` (`true`/`false`), `evidence`, `status` (`found` \| `uncertain` \| `not_found`) |
| `action_steps[]` | `array` | Ordered steps (`order`, `text`, `evidence`, `status`) |
| `submission_channel` | `EvidenceFieldString` | Portal URL, physical counter, postal address, or email |
| `fees_penalties[]` | `array` | Late fees, penalties, or statutory dues (`description`, `amount`, `evidence`, `status`) |
| `warnings[]` | `array` | Uncertainty alerts, scan defect notifications, ambiguity warnings (`code`, `message`, `severity`, `evidence`) |
| `document_quality` | `enum` | `"good"`, `"poor_scan"`, or `"incomplete"` |

---

## 3. Governance and Schema Evolution Rules

Per project rules in `rules.md`:
1. **Unanimous Approval**: Any schema change requires consensus from all 4 team members.
2. **Version Bump**: Increment the version number (`v1.0` -> `v1.1` for backward-compatible additions, `v2.0` for breaking changes).
3. **Changelog**: Every schema modification must be recorded below with rationales and affected components.

---

## 4. Changelog

- **v1.0 (2026-10-15)**:
  - Initial baseline contract.
  - Defined strict evidence objects (`page`, `quote`), deadline statuses (`found`, `ambiguous`, `conflicting`, `not_found`), and uncertainty warnings.
