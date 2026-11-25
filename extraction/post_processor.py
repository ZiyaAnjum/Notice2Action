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

# Indic numeral digit translation mapping
INDIC_DIGIT_MAP = str.maketrans({
    # Hindi numerals ०-९
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
    # Kannada numerals ೦-೯
    "೦": "0", "೧": "1", "೨": "2", "೩": "3", "೪": "4",
    "೫": "5", "೬": "6", "೭": "7", "೮": "8", "೯": "9",
})

# Standard and multilingual month name mapping
MONTH_MAP = {
    # English
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
    # Hindi
    "जनवरी": 1, "फ़रवरी": 2, "फरवरी": 2, "मार्च": 3, "अप्रैल": 4, "मई": 5,
    "जून": 6, "जुलाई": 7, "अगस्त": 8, "सितंबर": 9, "सितम्बर": 9,
    "अक्टूबर": 10, "अक्तूबर": 10, "नवंबर": 11, "नवम्बर": 11, "दिसंबर": 12, "दिसम्बर": 12,
    # Kannada
    "ಜನವರಿ": 1, "ಫೆಬ್ರವರಿ": 2, "ಮಾರ್ಚ್": 3, "ಏಪ್ರಿಲ್": 4, "ಮೇ": 5,
    "ಜೂನ್": 6, "ಜುಲೈ": 7, "ಆಗಸ್ಟ್": 8, "ಸೆಪ್ಟೆಂಬರ್": 9, "ಅಕ್ಟೋಬರ್": 10,
    "ನವೆಂಬರ್": 11, "ಡಿಸೆಂಬರ್": 12,
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
    """Parse various human-readable, standard, and Indic date representations into ISO YYYY-MM-DD format."""
    if not date_str or not isinstance(date_str, str):
        return None

    clean = unicodedata.normalize("NFKC", str(date_str)).translate(INDIC_DIGIT_MAP).strip()
    # 1. Already ISO format YYYY-MM-DD
    iso_match = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", clean)
    if iso_match:
        y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            pass

    # 2. Textual dates like "18 November 2026", "3 Nov 2026", "१५ नवंबर २०२६", "೨೦ ನವೆಂಬರ್ ೨೦೨೬"
    textual_match = re.search(
        r"\b(\d{1,2})\s+([^\s\d,;./\-]+)(?:,)?\s+(\d{4})\b", clean
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
        r"\b([^\s\d,;./\-]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b", clean
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

    # 3. Numeric dates like DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
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
    partial_match = re.search(r"\b(\d{1,2})\s+([^\s\d,;./\-]+)\b", clean)
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
    elif "notice" in norm_rel or "issue" in norm_rel or "bill" in norm_rel:
        target_date_str = base_dates.get("notice_date") or base_dates.get("issue_date") or base_dates.get("bill_date")
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
    if norm_quote in norm_page:
        return True
    clean_q = re.sub(r"[^\w\s]", "", norm_quote).strip()
    clean_p = re.sub(r"[^\w\s]", "", norm_page).strip()
    return bool(clean_q and clean_q in clean_p)


def ground_quote_against_page(
    quote: str | None,
    page: int | None,
    raw_pages: list[dict[str, Any]] | None,
    normalized_pages: list[str],
) -> tuple[bool, str]:
    """Verify and ground quote against page text.

    If exact match or normalized match is found on page: returns (True, quote).
    If verbatim match is missing but a sentence/clause on the page has >= 70% word overlap:
      replaces quote with the verbatim sentence from the page text, returning (True, matched_sentence).
    Otherwise returns (False, quote).
    """
    if not quote or not str(quote).strip():
        return False, quote or ""
    if page is None or not (1 <= page <= len(normalized_pages)):
        return False, str(quote)

    norm_quote = normalize_text_for_quote_match(quote)
    norm_page = normalized_pages[page - 1]

    # 1. Direct or normalized containment
    if norm_quote in norm_page:
        return True, str(quote)

    # 2. Relaxed punctuation containment
    clean_q = re.sub(r"[^\w\s]", "", norm_quote).strip()
    clean_p = re.sub(r"[^\w\s]", "", norm_page).strip()
    if clean_q and clean_q in clean_p:
        return True, str(quote)

    # 3. Sentence / clause fuzzy overlap from raw page text
    raw_page_text = raw_pages[page - 1].get("text", "") if raw_pages and (page - 1 < len(raw_pages)) else ""
    if not raw_page_text:
        return False, str(quote)

    lines = [l.strip() for l in re.split(r"\r?\n", raw_page_text) if l.strip()]
    clauses: list[str] = []
    for l in lines:
        for s in re.split(r"(?<=[.!?])\s+", l):
            s = s.strip()
            if s:
                clauses.append(s)

    q_words = set(re.sub(r"[^\w\s]", "", norm_quote).split())
    if not q_words:
        return False, str(quote)

    best_match = None
    best_overlap = 0.0

    for c in clauses:
        norm_c = normalize_text_for_quote_match(c)
        c_words = set(re.sub(r"[^\w\s]", "", norm_c).split())
        if not c_words:
            continue
        overlap = len(q_words & c_words) / len(q_words)
        if overlap > best_overlap:
            best_overlap = overlap
            best_match = c

    if best_overlap >= 0.70 and best_match:
        return True, best_match

    return False, str(quote)


def process_extracted_notice_to_decision_card(
    raw_data: dict[str, Any],
    pages: list[dict[str, Any]] | None = None,
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
    if pages is None:
        pages = []
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

    # 2.5 Extract and parse notice date (issue date)
    notice_date_raw = raw_data.get("notice_date")
    notice_date_iso = parse_iso_date(str(notice_date_raw)) if notice_date_raw else None
    if not notice_date_iso:
        nd_match = re.search(
            r"(?:notice\s*date|bill\s*date|issue\s*date|date\s*of\s*issue|\bdate)\s*[:\-]\s*([^\n,;]+?(?:20\d\d|19\d\d))",
            raw_text_full,
            re.IGNORECASE,
        )
        if nd_match:
            notice_date_iso = parse_iso_date(nd_match.group(1))
        else:
            nd_match2 = re.search(
                r"(?:notice\s*date|bill\s*date|issue\s*date|date\s*of\s*issue|\bdate)\s*[:\-]\s*([0-9\u0966-\u096F\u0CE6-\u0CEF]{1,2}[\s\/\-.][^\n,;]+)",
                raw_text_full,
                re.IGNORECASE,
            )
            if nd_match2:
                notice_date_iso = parse_iso_date(nd_match2.group(1))

    # 3. First pass: Collect explicit dates to serve as relative date anchors
    explicit_base_dates: dict[str, str] = {}
    if notice_date_iso:
        explicit_base_dates["notice_date"] = notice_date_iso
        explicit_base_dates["issue_date"] = notice_date_iso
        explicit_base_dates["bill_date"] = notice_date_iso

    raw_deadlines = raw_data.get("deadlines") or []
    if not isinstance(raw_deadlines, list):
        warnings.append(f"Invalid deadlines field type '{type(raw_deadlines).__name__}'; defaulted to empty list.")
        raw_deadlines = []

    for item in raw_deadlines:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind", "other")
        date_raw = item.get("date_raw") or item.get("date") or item.get("iso_date")
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

    # Initialize raw_consequences early so risk windows from deadlines can be routed here
    raw_consequences = list(raw_data.get("consequences") or raw_data.get("penalties") or [])

    for idx, item in enumerate(raw_deadlines):
        if not isinstance(item, dict):
            continue

        label = str(item.get("label") or item.get("description") or f"Deadline {idx+1}").strip()
        kind = str(item.get("kind") or "other").strip()
        date_raw = str(item.get("date_raw") or item.get("date") or item.get("iso_date") or "").strip()
        is_relative = bool(item.get("is_relative")) or (kind == "relative")
        offset_days = item.get("offset_days")
        relative_to = str(item.get("relative_to") or "due_date").strip()
        page = item.get("page")
        quote = item.get("quote") or item.get("evidence_quote") or ""

        # Move non-deadline risk/penalty windows out of timeline and into consequences
        label_lower = label.lower()
        is_risk_window = (
            "disconnect" in label_lower
            or kind == "disconnection_risk"
            or "risk window" in label_lower
            or "risk of" in label_lower
            or "penalty period" in label_lower
            or "penalty window" in label_lower
            or "penalty start" in label_lower
            or "late fee period" in label_lower
            or "late-fee period" in label_lower
            or "late fee start" in label_lower
            or "late-fee start" in label_lower
            or "surcharge period" in label_lower
            or "surcharge start" in label_lower
            or "notice period" in label_lower
        )
        # Real action deadlines (pay by, submit by, appear on) belong in timeline
        if is_risk_window and re.search(r"\b(pay|payment|submit|submission|appear|hearing|file|respond)\b", label_lower):
            is_risk_window = False

        if is_risk_window:
            consequence_date_str = date_raw
            if is_relative and offset_days:
                comp_d, _ = resolve_relative_date(
                    int(offset_days), relative_to, explicit_base_dates
                )
                if comp_d:
                    consequence_date_str = (
                        f"{comp_d} ({date_raw})"
                        if (date_raw and date_raw != comp_d)
                        else comp_d
                    )
            elif not consequence_date_str:
                iso_d = parse_iso_date(date_raw) if date_raw else None
                if iso_d:
                    consequence_date_str = iso_d

            val_desc = item.get("description") or item.get("value")
            if val_desc and not str(val_desc).lower().startswith("deadline"):
                val_str = str(val_desc)
                if consequence_date_str and consequence_date_str not in val_str:
                    c_val = f"{val_str} (effective: {consequence_date_str})"
                else:
                    c_val = val_str
            elif consequence_date_str:
                c_val = f"Risk starts from {consequence_date_str}"
            else:
                c_val = "Risk of service disconnection or penalty"

            raw_consequences.append({
                "label": label,
                "value": c_val,
                "page": page,
                "quote": quote,
            })
            continue

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

        # Detect ASAP phrases
        is_asap = (
            item.get("urgency") == "asap"
            or bool(re.search(
                r"\b(earliest|immediate|immediately|as\s*soon\s*as\s*possible|asap|without\s*delay|promptly)\b",
                f"{label} {date_raw}",
                re.IGNORECASE,
            ))
        )

        date_rule_text = str(item.get("date_rule_text") or ("" if not is_relative else date_raw)).strip() or None
        derived_from = None
        iso_date = None
        date_type = "exact"
        urgency = "none"
        anchor_date = None

        if is_asap:
            urgency = "asap"
            iso_date = None
            date_type = "exact"
            date_rule_text = date_rule_text or "At the earliest"
        elif is_relative and offset_days:
            computed_date, derived_from = resolve_relative_date(
                int(offset_days), relative_to, explicit_base_dates
            )
            iso_date = computed_date
            date_type = "calculated" if computed_date else "estimated"
            urgency = "relative"
            norm_rel_key = relative_to.lower()
            if "bill" in norm_rel_key or "issue" in norm_rel_key or "notice" in norm_rel_key:
                anchor_date = explicit_base_dates.get("notice_date")
            elif "due" in norm_rel_key:
                anchor_date = explicit_base_dates.get("due")
            else:
                anchor_date = next(iter(explicit_base_dates.values()), None)
        else:
            iso_date = parse_iso_date(date_raw)
            date_type = "exact" if iso_date else "estimated"
            urgency = "fixed" if iso_date else (item.get("urgency") or "none")

        # Post-processor drop rule: only drop if no date AND no date_rule_text AND urgency is not "asap"
        if not iso_date and not date_rule_text and not is_relative and urgency != "asap":
            continue

        # Quote verification and grounding in code
        verified, grounded_quote = ground_quote_against_page(quote, page, pages, normalized_pages)
        quote = grounded_quote
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
            "id": item.get("id") or f"dl-{idx+1}",
            "label": label,
            "kind": kind,
            "date": iso_date,
            "date_type": date_type,
            "urgency": urgency,
            "anchor_date": anchor_date,
            "date_rule_text": date_rule_text,
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

    # Sort deadlines timeline by date (null dates / asap go after fixed dates)
    processed_deadlines.sort(
        key=lambda d: (
            0 if d.get("date") else (1 if d.get("urgency") == "asap" else 2),
            d.get("date") or "9999-99-99",
        )
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

    # 7. Action steps processing (group alternatives and mark conditionals)
    raw_steps = raw_data.get("action_steps") or []
    if not isinstance(raw_steps, list):
        warnings.append("Action steps was not a list; defaulted to empty.")
        raw_steps = []

    cleaned_steps: list[dict[str, Any]] = []
    step_order = 1
    option_regex = re.compile(r"^(?:Option|Method|Way)\s*\d+[:.-]?\s*", re.IGNORECASE)

    for step in raw_steps:
        if not isinstance(step, dict):
            continue
        step_text = str(step.get("text") or step.get("instruction") or "").strip()
        if not step_text:
            warnings.append("Dropped action step with empty or whitespace-only text.")
            continue

        p = step.get("page")
        q = step.get("quote") or step.get("evidence_quote") or ""
        v, grounded_q = ground_quote_against_page(q, p, pages, normalized_pages)
        q = grounded_q
        ev: dict[str, Any] = {
            "page": p if isinstance(p, int) else 1,
            "quote": q,
            "verified": v,
        }
        if not v:
            ev["needs_verification"] = True
            warnings.append(f"Evidence quote for action step {step_order} could not be verified.")

        action_type = str(step.get("action_type") or "").lower()
        group_id = step.get("group_id")
        group_title = step.get("group_title")
        condition = step.get("condition")

        # Fallback grouping logic if model didn't group
        is_opt = bool(option_regex.search(step_text))
        is_cond = (
            bool(re.search(r"^(?:If you have already paid|In case already paid|If paid|If this applies to you)", step_text, re.IGNORECASE))
            or bool(condition)
        )

        if action_type not in ("required", "alternative", "conditional"):
            if is_cond:
                action_type = "conditional"
            elif is_opt:
                action_type = "alternative"
            else:
                action_type = "required"

        if action_type == "alternative":
            if not group_id:
                group_id = "group_payment_options"
            if not group_title:
                group_title = "Pay the bill / choose payment method"
        elif action_type == "conditional":
            if not condition:
                if "already paid" in step_text.lower():
                    condition = "Only if you have already paid"
                else:
                    condition = "Conditional step"
            if not group_id:
                group_id = f"group_cond_{step_order}"
            if not group_title:
                group_title = condition
        else:
            action_type = "required"
            if not group_id:
                group_id = f"group_{step_order}"
            if not group_title:
                group_title = step_text

        cleaned_steps.append({
            "order": step_order,
            "text": step_text,
            "action_type": action_type,
            "group_id": str(group_id),
            "group_title": str(group_title),
            "condition": str(condition) if condition else None,
            "evidence": ev,
        })
        step_order += 1

    # 8. Consequences processing
    cleaned_consequences: list[dict[str, Any]] = []
    for c in raw_consequences:
        if not isinstance(c, dict):
            continue
        c_label = str(c.get("label") or c.get("name") or "Consequence").strip()
        c_val = str(c.get("value") or c.get("amount") or c.get("description") or "").strip()
        p = c.get("page")
        q = c.get("quote") or c.get("evidence_quote") or ""
        v, grounded_q = ground_quote_against_page(q, p, pages, normalized_pages)
        q = grounded_q
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
            doc_cond = doc.get("condition")
            is_cond = bool(doc.get("is_conditional") or doc_cond)
            if not doc_cond and "receipt" in doc_name.lower():
                doc_cond = "Only if you have already paid"
                is_cond = True

            p = doc.get("page")
            q = doc.get("quote") or doc.get("evidence_quote") or ""
            v, grounded_q = ground_quote_against_page(q, p, pages, normalized_pages)
            q = grounded_q
            cleaned_docs.append({
                "name": doc_name,
                "condition": doc_cond,
                "is_conditional": is_cond,
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
            v, grounded_q = ground_quote_against_page(q, p, pages, normalized_pages)
            q = grounded_q
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
        v, grounded_q = ground_quote_against_page(q, p, pages, normalized_pages)
        q = grounded_q
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
            v, grounded_q = ground_quote_against_page(q, p, pages, normalized_pages)
            q = grounded_q
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

    # 11. Simple Summary (factual, 4 fields)
    raw_simple = raw_data.get("simple_summary") or {}
    if not isinstance(raw_simple, dict):
        raw_simple = {}

    what_is_this = str(raw_simple.get("what_is_this") or "").strip()
    if not what_is_this:
        if source_org and notice_date_iso:
            what_is_this = f"{source_org} sent a {notice_type} notice dated {notice_date_iso}."
        elif source_org:
            what_is_this = f"{source_org} sent a {notice_type} notice."
        elif one_line_summary:
            what_is_this = one_line_summary
        else:
            what_is_this = f"Official {notice_type} notice."

    what_to_do = str(raw_simple.get("what_to_do") or "").strip()
    if not what_to_do:
        amt_text = None
        if amount_due and isinstance(amount_due, dict) and amount_due.get("amount") is not None:
            c = amount_due.get("currency") or "INR"
            sym = "₹" if c in ("INR", "Rs", "Rs.", "₹") else f"{c} "
            amt_val = amount_due["amount"]
            amt_text = f"{sym}{amt_val:,.2f}".replace(".00", "") if isinstance(amt_val, (int, float)) else f"{sym}{amt_val}"

        primary_step_title = str(cleaned_steps[0].get("group_title") or cleaned_steps[0]["text"]).strip() if cleaned_steps else None
        if primary_step_title and amt_text:
            what_to_do = f"{primary_step_title} of {amt_text}"
        elif amt_text:
            what_to_do = f"Pay outstanding amount of {amt_text}"
        elif primary_step_title:
            what_to_do = primary_step_title
        else:
            what_to_do = ""

    by_when = str(raw_simple.get("by_when") or "").strip()
    if not by_when:
        if any(d.get("urgency") == "asap" for d in processed_deadlines) and not primary_deadline_date:
            by_when = "No fixed date. Do this as soon as possible."
        elif primary_deadline_date:
            by_when = f"By {primary_deadline_date}."
        elif processed_deadlines and processed_deadlines[0].get("date_rule_text"):
            by_when = f"{processed_deadlines[0]['date_rule_text']}."
        else:
            by_when = ""

    if_you_ignore = str(raw_simple.get("if_you_ignore") or "").strip()
    if not if_you_ignore:
        if cleaned_consequences:
            c0 = cleaned_consequences[0]
            val = str(c0.get("value") or "").strip()
            lbl = str(c0.get("label") or "").strip()
            if val and lbl and lbl != val:
                if_you_ignore = f"{lbl}: {val}."
            elif val:
                if_you_ignore = f"{val}."
            elif lbl:
                if_you_ignore = f"{lbl}."
        else:
            if_you_ignore = ""

    simple_summary = {
        "what_is_this": what_is_this,
        "what_to_do": what_to_do,
        "by_when": by_when,
        "if_you_ignore": if_you_ignore,
    }

    result: dict[str, Any] = {
        "status": status,
        "warnings": warnings,
        "notice_date": notice_date_iso,
        "headline": headline,
        "simple_summary": simple_summary,
        "deadlines": processed_deadlines,
        "action_steps": cleaned_steps,
        "consequences": cleaned_consequences,
        "summary_plain": summary_plain,
        "raw_text_ref": raw_text_full[:2000],
        # Backward-compatible metadata keys
        "schema_version": "2.2",
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
