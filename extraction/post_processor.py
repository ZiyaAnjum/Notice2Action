"""Post-processor for structured notice data.

Implements STEP 3 (Compute in code, not in the LLM) and STEP 4 (Decision card output schema):
- Normalizes dates to ISO format in code.
- Resolves relative dates ("within 7 days of due date") into computed dates with date_type "estimated".
- Models tiered deadlines as an ordered timeline sorted by date with kind:
  "no_penalty_by" | "due" | "disconnection_risk" | "other" | "ambiguous".
- Extracts and normalizes money to {amount: float, currency: str}.
- Verifies evidence quotes against raw page texts (whitespace and quote normalized).
- Computes urgency ("overdue" | "urgent" | "soon" | "none") dynamically.
- Assembles the clean decision card schema with empty fields omitted.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta
from typing import Any

# Standard month name mapping
MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

CURRENCY_SYMBOLS = {
    "rs": "INR",
    "rs.": "INR",
    "inr": "INR",
    "₹": "INR",
    "$": "USD",
    "usd": "USD",
    "€": "EUR",
    "eur": "EUR",
    "£": "GBP",
    "gbp": "GBP",
}


def normalize_text_for_quote_match(text: str) -> str:
    """Normalize whitespace, unicode accents, and quote characters for verbatim match checking."""
    if not text:
        return ""
    # Unicode NFC normalization
    normalized = unicodedata.normalize("NFC", str(text))
    # Replace curved/curly quotes, apostrophes, and dashes with standard ASCII
    normalized = re.sub(r"[‘’`´]", "'", normalized)
    normalized = re.sub(r'[“”"״]', '"', normalized)
    normalized = re.sub(r"[–—―]", "-", normalized)
    # Collapse multiple whitespaces and tabs to single spaces
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized.lower()


def parse_iso_date(date_str: str | None, default_year: int = 2026) -> str | None:
    """Parse various human-readable and standard date representations into ISO YYYY-MM-DD format."""
    if not date_str or not isinstance(date_str, str):
        return None

    clean = date_str.strip()
    # 1. Already ISO format YYYY-MM-DD
    iso_match = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", clean)
    if iso_match:
        y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            pass

    # 2. Textual dates like "18 November 2026", "3 Nov 2026", "November 18, 2026"
    textual_match = re.search(
        r"\b(\d{1,2})\s+([A-Za-z]+)(?:,)?\s+(\d{4})\b", clean
    )
    if textual_match:
        d = int(textual_match.group(1))
        m_str = textual_match.group(2).lower()
        y = int(textual_match.group(3))
        if m_str in MONTH_MAP:
            try:
                return date(y, MONTH_MAP[m_str], d).isoformat()
            except ValueError:
                pass

    textual_match2 = re.search(
        r"\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b", clean
    )
    if textual_match2:
        m_str = textual_match2.group(1).lower()
        d = int(textual_match2.group(2))
        y = int(textual_match2.group(3))
        if m_str in MONTH_MAP:
            try:
                return date(y, MONTH_MAP[m_str], d).isoformat()
            except ValueError:
                pass

    # 3. Numeric dates like DD-MM-YYYY or DD/MM/YYYY
    dmy_match = re.search(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b", clean)
    if dmy_match:
        d, m, y = int(dmy_match.group(1)), int(dmy_match.group(2)), int(dmy_match.group(3))
        if m > 12 >= d:  # Could be MM/DD/YYYY
            d, m = m, d
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            pass

    # 4. Partial textual like "18 November" without year
    partial_match = re.search(r"\b(\d{1,2})\s+([A-Za-z]+)\b", clean)
    if partial_match:
        d = int(partial_match.group(1))
        m_str = partial_match.group(2).lower()
        if m_str in MONTH_MAP:
            try:
                return date(default_year, MONTH_MAP[m_str], d).isoformat()
            except ValueError:
                pass

    return None


def resolve_relative_date(
    offset_days: int,
    relative_to: str,
    base_dates: dict[str, str],
) -> tuple[str | None, dict[str, Any]]:
    """Compute exact date from relative offset (e.g. within 7 days of due date).

    Args:
        offset_days: Integer number of days (e.g. 7).
        relative_to: Target date anchor key (e.g. 'due_date', 'notice_date', 'bill_date').
        base_dates: Dictionary of known ISO date strings indexed by key.

    Returns:
        Tuple of (computed_iso_date_string, derived_from_dict).
    """
    derived_from = {"offset_days": offset_days, "relative_to": relative_to}

    norm_rel = relative_to.lower().strip()
    target_date_str = None

    if "due" in norm_rel:
        target_date_str = base_dates.get("due") or base_dates.get("due_date")
    elif "notice" in norm_rel or "issue" in norm_rel:
        target_date_str = base_dates.get("notice_date") or base_dates.get("issue_date")
    elif "surcharge" in norm_rel or "no_penalty" in norm_rel:
        target_date_str = base_dates.get("no_penalty_by")

    # Fallback to any single base date if only one exists
    if not target_date_str and len(base_dates) == 1:
        target_date_str = next(iter(base_dates.values()))

    if not target_date_str:
        return None, derived_from

    try:
        y, m, d = (int(x) for x in target_date_str.split("-"))
        base_dt = date(y, m, d)
        resolved_dt = base_dt + timedelta(days=offset_days)
        return resolved_dt.isoformat(), derived_from
    except Exception:
        return None, derived_from


def parse_money(amount_raw: Any, text_fallback: str = "") -> dict[str, Any] | None:
    """Normalize monetary amount into structured {amount: float, currency: str}."""
    if isinstance(amount_raw, dict):
        amt = amount_raw.get("amount")
        curr = amount_raw.get("currency") or "INR"
        if amt is not None:
            try:
                val = float(str(amt).replace(",", "").strip())
                return {"amount": val, "currency": str(curr).upper().strip()}
            except (ValueError, TypeError):
                pass

    corpus = str(amount_raw or "") + " " + str(text_fallback or "")
    # Match patterns like: Rs. 4,860.00, Rs 4860, ₹4,860, $150, 4860 INR
    match = re.search(
        r"(rs\.?|inr|₹|\$|usd|€|eur|£|gbp)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)",
        corpus,
        re.IGNORECASE,
    )
    if match:
        sym = match.group(1).lower().strip()
        num_str = match.group(2).replace(",", "").strip()
        try:
            val = float(num_str)
            curr = CURRENCY_SYMBOLS.get(sym, "INR")
            return {"amount": val, "currency": curr}
        except ValueError:
            pass

    # Reverse match: 4860.00 Rs / INR
    rev_match = re.search(
        r"([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(rs\.?|inr|usd|eur|gbp)",
        corpus,
        re.IGNORECASE,
    )
    if rev_match:
        num_str = rev_match.group(1).replace(",", "").strip()
        sym = rev_match.group(2).lower().strip()
        try:
            val = float(num_str)
            curr = CURRENCY_SYMBOLS.get(sym, "INR")
            return {"amount": val, "currency": curr}
        except ValueError:
            pass

    return None


def compute_urgency(
    primary_date_iso: str | None,
    reference_date: date | None = None,
) -> str:
    """Compute deadline urgency level: 'overdue' | 'urgent' | 'soon' | 'none'.

    Rules:
    - overdue: primary deadline date is strictly in the past (< reference_date).
    - urgent: 0 to 3 days remaining.
    - soon: 4 to 14 days remaining.
    - none: more than 14 days remaining or no deadline.
    """
    if not primary_date_iso:
        return "none"

    ref = reference_date or date.today()
    try:
        y, m, d = (int(x) for x in primary_date_iso.split("-"))
        deadline_dt = date(y, m, d)
    except Exception:
        return "none"

    delta_days = (deadline_dt - ref).days

    if delta_days < 0:
        return "overdue"
    elif delta_days <= 3:
        return "urgent"
    elif delta_days <= 14:
        return "soon"
    else:
        return "none"


def verify_quote(
    quote: str | None,
    page: int | None,
    normalized_pages: list[str],
) -> bool:
    """Verify in code whether the verbatim evidence quote exists in the extracted page text."""
    if not quote or not str(quote).strip():
        return False
    if page is None or not (1 <= page <= len(normalized_pages)):
        return False

    norm_quote = normalize_text_for_quote_match(quote)
    norm_page = normalized_pages[page - 1]
    return norm_quote in norm_page


def process_extracted_notice_to_decision_card(
    raw_data: dict[str, Any],
    pages: list[dict[str, Any]],
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Transform raw LLM extraction into the new Decision Card schema (STEP 4).

    Performs code-driven computations:
    1. Resolves relative dates and normalizes all deadlines to ISO dates.
    2. Builds an ordered deadline timeline with appropriate kinds ('no_penalty_by', 'due', 'disconnection_risk', 'other').
    3. Normalizes money into structured {amount, currency}.
    4. Verifies each evidence quote against extracted page texts.
    5. Computes urgency in code.
    6. Drops empty action steps and omits empty optional arrays.
    7. Emits warnings for unverified or repaired fields.
    """
    warnings: list[str] = []
    normalized_pages = [
        normalize_text_for_quote_match(p.get("text", "")) for p in pages
    ]
    raw_text_full = "\n\n".join(
        f"[PAGE {p.get('page_number', idx+1)}]\n{p.get('text', '')}"
        for idx, p in enumerate(pages)
    )

    # 1. Base notice info
    notice_type = (
        raw_data.get("notice_type")
        or raw_data.get("category")
        or "official_notice"
    )
    source_org = (
        raw_data.get("source_organisation")
        or (raw_data.get("issuing_organisation", {}) or {}).get("value")
        or "Official Authority"
    )

    # 2. Amount Due computation
    amount_due = parse_money(raw_data.get("amount_due"), text_fallback=raw_text_full)

    # 3. First pass: Collect explicit dates to serve as relative date anchors
    explicit_base_dates: dict[str, str] = {}
    raw_deadlines = raw_data.get("deadlines") or []
    if not isinstance(raw_deadlines, list):
        warnings.append(f"Invalid deadlines field type '{type(raw_deadlines).__name__}'; defaulted to empty list.")
        raw_deadlines = []

    for item in raw_deadlines:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind", "other")
        date_raw = item.get("date_raw") or item.get("date")
        is_rel = bool(item.get("is_relative")) or kind == "relative"
        if not is_rel and date_raw:
            iso_d = parse_iso_date(str(date_raw))
            if iso_d:
                if kind in ("no_penalty_by", "due", "disconnection_risk"):
                    explicit_base_dates[kind] = iso_d
                explicit_base_dates.setdefault(kind, iso_d)

    # If bill due date not explicit, check notice text for due date
    if "due" not in explicit_base_dates:
        due_match = re.search(r"due\s+date\s*(?:printed\s*on\s*your\s*bill\s*is)?\s*[:is]*\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})", raw_text_full, re.IGNORECASE)
        if due_match:
            parsed_due = parse_iso_date(due_match.group(1))
            if parsed_due:
                explicit_base_dates["due"] = parsed_due

    # 4. Second pass: Process deadlines into ordered timeline
    processed_deadlines: list[dict[str, Any]] = []
    seen_roles: dict[str, list[dict[str, Any]]] = {}

    for idx, item in enumerate(raw_deadlines):
        if not isinstance(item, dict):
            continue

        label = str(item.get("label") or item.get("description") or f"Deadline {idx+1}").strip()
        kind = str(item.get("kind") or "other").strip()
        date_raw = str(item.get("date_raw") or item.get("date") or "").strip()
        is_relative = bool(item.get("is_relative")) or (kind == "relative")
        offset_days = item.get("offset_days")
        relative_to = str(item.get("relative_to") or "due_date").strip()
        page = item.get("page")
        quote = item.get("quote") or item.get("evidence_quote") or ""

        # Map kind to valid contract enum
        if kind not in ("no_penalty_by", "due", "disconnection_risk", "other", "ambiguous"):
            if "no_penalty" in kind or "without_surcharge" in kind or "without surcharge" in label.lower():
                kind = "no_penalty_by"
            elif "due" in kind or "bill" in kind:
                kind = "due"
            elif "disconnect" in kind or "cutoff" in kind or "service" in kind:
                kind = "disconnection_risk"
            else:
                kind = "other"

        derived_from = None
        iso_date = None
        date_type = "exact"

        if is_relative and offset_days:
            computed_date, derived_from = resolve_relative_date(
                int(offset_days), relative_to, explicit_base_dates
            )
            iso_date = computed_date
            date_type = "estimated"
        else:
            iso_date = parse_iso_date(date_raw)
            date_type = "exact" if iso_date else "estimated"

        # Quote verification in code
        verified = verify_quote(quote, page, normalized_pages)
        evidence_dict: dict[str, Any] = {
            "page": page if isinstance(page, int) else 1,
            "quote": quote,
            "verified": verified,
        }
        if not verified:
            evidence_dict["needs_verification"] = True
            warnings.append(
                f"Evidence quote for deadline '{label}' could not be verified verbatim on page {page}."
            )

        deadline_record = {
            "id": f"dl-{idx+1}",
            "label": label,
            "kind": kind,
            "date": iso_date,
            "date_type": date_type,
            "derived_from": derived_from,
            "evidence": evidence_dict,
            "status": "found" if verified else "uncertain",
        }
        processed_deadlines.append(deadline_record)

        # Track roles to detect genuine ambiguous conflicts (two distinct dates claiming the exact same role)
        if iso_date:
            seen_roles.setdefault(kind, []).append(deadline_record)

    # Check for genuine ambiguous conflicts (same kind claiming two different exact dates)
    for role, group in seen_roles.items():
        if role in ("no_penalty_by", "due") and len(group) > 1:
            unique_dates = {g["date"] for g in group if g["date"]}
            if len(unique_dates) > 1:
                # Mark as ambiguous
                for g in group:
                    g["kind"] = "ambiguous"
                warnings.append(
                    f"Ambiguous conflicting dates found for role '{role}': {sorted(unique_dates)}."
                )

    # Sort deadlines timeline by date (null dates go to end)
    processed_deadlines.sort(
        key=lambda d: (0, d["date"]) if d["date"] else (1, "9999-99-99")
    )
    # Re-assign deterministic sequential IDs: dl-1, dl-2, ...
    for i, d in enumerate(processed_deadlines):
        d["id"] = f"dl-{i+1}"

    # 5. Primary deadline selection
    primary_deadline_id: str | None = None
    primary_deadline_date: str | None = None

    # Prefer 'no_penalty_by' first, then 'due', then earliest deadline
    for d in processed_deadlines:
        if d.get("kind") == "no_penalty_by" and d.get("date"):
            primary_deadline_id = d["id"]
            primary_deadline_date = d["date"]
            break
    if not primary_deadline_id:
        for d in processed_deadlines:
            if d.get("kind") == "due" and d.get("date"):
                primary_deadline_id = d["id"]
                primary_deadline_date = d["date"]
                break
    if not primary_deadline_id and processed_deadlines:
        first_d = processed_deadlines[0]
        primary_deadline_id = first_d["id"]
        primary_deadline_date = first_d.get("date")

    # 6. Urgency computation in code
    urgency = compute_urgency(primary_deadline_date, reference_date=reference_date)

    # 7. Action steps processing (drop steps with empty text, re-order 1..N)
    raw_steps = raw_data.get("action_steps") or []
    if not isinstance(raw_steps, list):
        warnings.append("Action steps was not a list; defaulted to empty.")
        raw_steps = []

    cleaned_steps: list[dict[str, Any]] = []
    step_order = 1
    for step in raw_steps:
        if not isinstance(step, dict):
            continue
        step_text = str(step.get("text") or step.get("instruction") or "").strip()
        if not step_text:
            warnings.append("Dropped action step with empty or whitespace-only text.")
            continue

        p = step.get("page")
        q = step.get("quote") or step.get("evidence_quote") or ""
        v = verify_quote(q, p, normalized_pages)
        ev: dict[str, Any] = {
            "page": p if isinstance(p, int) else 1,
            "quote": q,
            "verified": v,
        }
        if not v:
            ev["needs_verification"] = True
            warnings.append(f"Evidence quote for action step {step_order} could not be verified.")

        cleaned_steps.append({
            "order": step_order,
            "text": step_text,
            "evidence": ev,
        })
        step_order += 1

    # 8. Consequences processing
    raw_consequences = raw_data.get("consequences") or raw_data.get("penalties") or []
    if not isinstance(raw_consequences, list):
        raw_consequences = []

    cleaned_consequences: list[dict[str, Any]] = []
    for c in raw_consequences:
        if not isinstance(c, dict):
            continue
        c_label = str(c.get("label") or c.get("name") or "Consequence").strip()
        c_val = str(c.get("value") or c.get("amount") or c.get("description") or "").strip()
        p = c.get("page")
        q = c.get("quote") or c.get("evidence_quote") or ""
        v = verify_quote(q, p, normalized_pages)
        ev_c: dict[str, Any] = {
            "page": p if isinstance(p, int) else 1,
            "quote": q,
            "verified": v,
        }
        if not v and q:
            ev_c["needs_verification"] = True

        cleaned_consequences.append({
            "label": c_label,
            "value": c_val,
            "evidence": ev_c,
        })

    # 9. Required documents (omit key if empty)
    raw_docs = raw_data.get("required_documents") or []
    cleaned_docs: list[dict[str, Any]] = []
    if isinstance(raw_docs, list):
        for doc in raw_docs:
            if not isinstance(doc, dict):
                continue
            doc_name = str(doc.get("name") or "").strip()
            if not doc_name:
                continue
            p = doc.get("page")
            q = doc.get("quote") or doc.get("evidence_quote") or ""
            v = verify_quote(q, p, normalized_pages)
            cleaned_docs.append({
                "name": doc_name,
                "evidence": {"page": p if isinstance(p, int) else 1, "quote": q, "verified": v},
                "status": "found" if v else "uncertain",
            })

    # 10. Where to submit (omit key if empty)
    raw_channels = raw_data.get("where_to_submit") or raw_data.get("submission_channel") or []
    cleaned_channels: list[dict[str, Any]] = []
    if isinstance(raw_channels, list):
        for ch in raw_channels:
            if not isinstance(ch, dict):
                continue
            c_name = str(ch.get("channel") or ch.get("name") or "").strip()
            c_det = str(ch.get("details") or ch.get("address") or "").strip()
            if not c_name and not c_det:
                continue
            p = ch.get("page")
            q = ch.get("quote") or ch.get("evidence_quote") or ""
            v = verify_quote(q, p, normalized_pages)
            cleaned_channels.append({
                "channel": c_name or "Submission Point",
                "details": c_det,
                "evidence": {"page": p if isinstance(p, int) else 1, "quote": q, "verified": v},
            })
    elif isinstance(raw_channels, dict):
        c_name = str(raw_channels.get("channel") or raw_channels.get("name") or "Direct Submission").strip()
        c_det = str(raw_channels.get("details") or raw_channels.get("value") or "").strip()
        p = raw_channels.get("page")
        q = raw_channels.get("quote") or raw_channels.get("evidence_quote") or ""
        v = verify_quote(q, p, normalized_pages)
        cleaned_channels.append({
            "channel": c_name,
            "details": c_det,
            "evidence": {"page": p if isinstance(p, int) else 1, "quote": q, "verified": v},
        })

    # 11. Conditions that apply (omit key if empty)
    raw_conditions = raw_data.get("conditions_that_apply") or []
    cleaned_conditions: list[dict[str, Any]] = []
    if isinstance(raw_conditions, list):
        for cond in raw_conditions:
            if not isinstance(cond, dict):
                continue
            c_text = str(cond.get("condition") or cond.get("text") or "").strip()
            if not c_text:
                continue
            p = cond.get("page")
            q = cond.get("quote") or cond.get("evidence_quote") or ""
            v = verify_quote(q, p, normalized_pages)
            cleaned_conditions.append({
                "condition": c_text,
                "evidence": {"page": p if isinstance(p, int) else 1, "quote": q, "verified": v},
            })

    # 12. Summaries
    one_line_summary = str(raw_data.get("one_line_summary") or "").strip()
    summary_plain = str(raw_data.get("summary_plain") or "").strip()

    if not one_line_summary:
        if amount_due and primary_deadline_date:
            curr = amount_due["currency"]
            amt = amount_due["amount"]
            one_line_summary = f"Pay {curr} {amt:,.2f} by {primary_deadline_date}."
        elif primary_deadline_date:
            one_line_summary = f"Respond by {primary_deadline_date} to complete required notice actions."
        else:
            one_line_summary = f"Official notice from {source_org} regarding {notice_type}."

    if not summary_plain:
        summary_plain = one_line_summary

    # Headline construction
    headline = {
        "one_line_summary": one_line_summary,
        "notice_type": notice_type,
        "source_organisation": source_org,
        "amount_due": amount_due,
        "primary_deadline_id": primary_deadline_id,
        "urgency": urgency,
    }

    # Determine overall status: complete | partial | failed
    has_text = any(len(p.get("text", "").strip()) > 0 for p in pages)
    has_summary = bool(one_line_summary and summary_plain)

    if not has_text or not has_summary:
        status = "failed"
    elif len(warnings) > 0 or not cleaned_steps:
        status = "partial"
    else:
        status = "complete"

    result: dict[str, Any] = {
        "status": status,
        "warnings": warnings,
        "headline": headline,
        "deadlines": processed_deadlines,
        "action_steps": cleaned_steps,
        "consequences": cleaned_consequences,
        "summary_plain": summary_plain,
        "raw_text_ref": raw_text_full[:2000],
        # Backward-compatible metadata keys
        "schema_version": "2.0",
        "category": notice_type,
    }

    # Omit empty optional keys per STEP 4 instructions
    if cleaned_docs:
        result["required_documents"] = cleaned_docs
    if cleaned_channels:
        result["where_to_submit"] = cleaned_channels
    if cleaned_conditions:
        result["conditions_that_apply"] = cleaned_conditions

    # Preserve any existing raw_data keys (such as notice_id, notice_title, etc.) for backwards compatibility
    if isinstance(raw_data, dict):
        for k, v in raw_data.items():
            if k not in result:
                result[k] = v

    return result
