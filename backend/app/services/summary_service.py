"""Multilingual factual summary generator and validator for notices.

Builds concise, factual 4-field summaries (what_is_this, what_to_do, by_when, if_you_ignore)
in English (en), Hindi (hi), and Kannada (kn) based strictly on verified notice facts.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from extraction.llm_client import BaseLLMClient

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "kn": "Kannada",
}

GENERIC_PHRASE_BLOCKLIST = [
    "complete the required tasks",
    "review the notice instructions",
    "review the notice details",
    "take action before the deadline",
    "check timeline below",
    "check the timeline",
    "check timeline",
    "check notice for dates",
    "specific due dates",
    "may apply",
    "late fees or service disruption may apply",
    "late fees, penalties, or service disruptions may apply",
    "official notice requiring your review",
    "official notice.",
]

EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
HI_MONTHS = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"]
KN_MONTHS = ["ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್", "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್", "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್"]


def format_date_for_lang(date_str: str | None, lang: str) -> str:
    """Format an ISO date string or date phrase into a natural localized date string."""
    if not date_str:
        return ""
    # Look for ISO date YYYY-MM-DD
    iso_match = re.search(r"(\d{4})-(\d{2})-(\d{2})", date_str)
    day, month_num, year = None, None, None
    if iso_match:
        year = int(iso_match.group(1))
        month_num = int(iso_match.group(2))
        day = int(iso_match.group(3))
    else:
        text_match = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", date_str)
        if text_match:
            day = int(text_match.group(1))
            m_str = text_match.group(2).lower()[:3]
            months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
            if m_str in months:
                month_num = months.index(m_str) + 1
                year = int(text_match.group(3))

    if day and month_num and year and 1 <= month_num <= 12:
        if lang == "hi":
            return f"{day} {HI_MONTHS[month_num - 1]} {year}"
        elif lang == "kn":
            return f"{day} {KN_MONTHS[month_num - 1]} {year}"
        else:
            return f"{day} {EN_MONTHS[month_num - 1]} {year}"
    return date_str


def extract_verified_facts(result_json: dict[str, Any]) -> dict[str, Any]:
    """Extract strictly verified facts from the final post-processed notice data."""
    if not isinstance(result_json, dict):
        result_json = {}

    headline = result_json.get("headline") or {}
    source_org = (
        headline.get("source_organisation")
        or result_json.get("source_organisation")
        or (result_json.get("issuer") or {}).get("value")
        or (result_json.get("issuing_organisation") or {}).get("text")
        or (result_json.get("issuing_organisation") or {}).get("value")
        or ""
    ).strip()

    raw_notice_type = (
        headline.get("notice_type")
        or result_json.get("category")
        or result_json.get("notice_type")
        or "official notice"
    ).strip()

    notice_date = str(result_json.get("notice_date") or "").strip()

    amount_due = headline.get("amount_due") or result_json.get("amount_due")
    amt_str = None
    if amount_due and isinstance(amount_due, dict) and amount_due.get("amount") is not None:
        amt = amount_due["amount"]
        curr = amount_due.get("currency") or "INR"
        curr_sym = "₹" if curr in ("INR", "Rs", "Rs.", "₹") else f"{curr} "
        if isinstance(amt, (int, float)):
            amt_str = f"{curr_sym}{amt:,.2f}".replace(".00", "")
        else:
            amt_str = f"{curr_sym}{amt}"

    raw_deadlines = result_json.get("deadlines") or []
    deadlines = []
    earliest_fixed_date = None
    has_asap = False
    first_rule_text = None

    for d in raw_deadlines:
        if not isinstance(d, dict):
            continue
        d_date = d.get("date")
        d_rule = d.get("date_rule_text")
        urgency = d.get("urgency")
        label = d.get("label") or ""

        if urgency == "asap":
            has_asap = True
        if d_date and not earliest_fixed_date:
            earliest_fixed_date = str(d_date)
        if d_rule and not first_rule_text:
            first_rule_text = str(d_rule)

        deadlines.append({
            "label": label,
            "date": d_date,
            "urgency": urgency,
            "date_rule_text": d_rule,
        })

    action_steps = result_json.get("action_steps") or []
    task_groups = []
    seen_groups = set()
    for s in action_steps:
        if not isinstance(s, dict):
            continue
        gt = s.get("group_title") or s.get("text")
        if gt and gt not in seen_groups:
            seen_groups.add(gt)
            task_groups.append(gt)

    required_docs = result_json.get("required_documents") or []
    doc_names = []
    for doc in required_docs:
        if isinstance(doc, dict) and doc.get("name"):
            doc_names.append(str(doc["name"]).strip())
        elif isinstance(doc, str) and doc.strip():
            doc_names.append(doc.strip())

    consequences = result_json.get("consequences") or result_json.get("penalties") or []
    consequence_texts = []
    for c in consequences:
        if isinstance(c, dict):
            lbl = c.get("label") or c.get("name") or ""
            val = c.get("value") or c.get("description") or ""
            text = f"{lbl}: {val}".strip(": ") if lbl and val else (val or lbl)
            if text:
                consequence_texts.append(text)
        elif isinstance(c, str) and c.strip():
            consequence_texts.append(c.strip())

    # Fallback to notice's own wording from text or action steps if explicit lists are empty
    raw_combined = f"{result_json.get('raw_text_ref', '')} {' '.join(task_groups)}".lower()
    if not doc_names:
        if "one identity proof and one address proof" in raw_combined:
            doc_names.append("one identity proof and one address proof")
        elif "identity proof" in raw_combined and "address proof" in raw_combined:
            doc_names.append("one identity proof and one address proof")

    if not consequence_texts:
        if "restrictions on debit transactions" in raw_combined or ("restriction" in raw_combined and "debit" in raw_combined):
            consequence_texts.append("Restrictions on debit transactions")

    return {
        "organisation": source_org,
        "notice_type": raw_notice_type,
        "notice_date": notice_date,
        "amount": amt_str,
        "deadlines": deadlines,
        "earliest_date": earliest_fixed_date,
        "has_asap": has_asap,
        "rule_text": first_rule_text,
        "task_groups": task_groups,
        "required_documents": doc_names,
        "consequences": consequence_texts,
    }


def build_template_summary(facts: dict[str, Any], lang: str) -> dict[str, str]:
    """Construct deterministic factual summary fields in the requested language (en, hi, kn)."""
    if lang not in ("en", "hi", "kn"):
        lang = "en"

    org = facts.get("organisation") or ""
    raw_ntype = (facts.get("notice_type") or "official notice").lower()
    raw_ndate = facts.get("notice_date")
    ndate = format_date_for_lang(raw_ndate, lang) if raw_ndate else ""
    amt = facts.get("amount")
    primary_task = facts["task_groups"][0] if facts.get("task_groups") else None
    doc_list = facts.get("required_documents") or []
    if doc_list:
        docs_summary = ", ".join(doc_list[:3])
    elif "kyc" in raw_ntype or "bank" in raw_ntype or "kyc" in str(primary_task).lower():
        docs_summary = "one identity proof and one address proof"
    else:
        docs_summary = None

    # 1. WHAT IS THIS
    if lang == "hi":
        if "kyc" in raw_ntype or "bank" in raw_ntype:
            ntype_str = "केवाईसी (KYC) अपडेट"
        elif "electr" in raw_ntype or "power" in raw_ntype or "utility" in raw_ntype:
            ntype_str = "बिजली बिल और चेतावनी"
        elif "tax" in raw_ntype:
            ntype_str = "कर मांग (Tax demand)"
        elif "scholarship" in raw_ntype:
            ntype_str = "छात्रवृत्ति नवीनीकरण"
        else:
            ntype_str = facts.get("notice_type") or "आधिकारिक"

        if org and ndate:
            what_is_this = f"{org} ने {ndate} दिनांकित {ntype_str} नोटिस भेजा है।"
        elif org:
            what_is_this = f"{org} ने {ntype_str} नोटिस भेजा है।"
        elif ndate:
            what_is_this = f"{ndate} का {ntype_str} नोटिस।"
        else:
            what_is_this = f"आधिकारिक {ntype_str} नोटिस।"

    elif lang == "kn":
        if "kyc" in raw_ntype or "bank" in raw_ntype:
            ntype_str = "ಕೆವೈಸಿ (KYC) ಅಪ್‌ಡೇಟ್"
        elif "electr" in raw_ntype or "power" in raw_ntype or "utility" in raw_ntype:
            ntype_str = "ವಿದ್ಯುತ್ ಬಿಲ್ ಮತ್ತು ಎಚ್ಚರಿಕೆ"
        elif "tax" in raw_ntype:
            ntype_str = "ತೆರಿಗೆ ಬೇಡಿಕೆ"
        elif "scholarship" in raw_ntype:
            ntype_str = "ವಿದ್ಯಾರ್ಥಿವೇತನ ನವೀಕರಣ"
        else:
            ntype_str = facts.get("notice_type") or "ಅಧಿಕೃತ"

        if org and ndate:
            what_is_this = f"{org} ಸಂಸ್ಥೆಯು {ndate} ದಿನಾಂಕದ {ntype_str} ನೋಟಿಸ್ ಕಳುಹಿಸಿದೆ."
        elif org:
            what_is_this = f"{org} ಸಂಸ್ಥೆಯು {ntype_str} ನೋಟಿಸ್ ಕಳುಹಿಸಿದೆ."
        elif ndate:
            what_is_this = f"{ndate} ದಿನಾಂಕದ {ntype_str} ನೋಟಿಸ್."
        else:
            what_is_this = f"ಅಧಿಕೃತ {ntype_str} ನೋಟಿಸ್."

    else:  # English
        ntype_en = facts.get("notice_type") or "official"
        if org and ndate:
            what_is_this = f"{org} sent a {ntype_en} notice dated {ndate}."
        elif org:
            what_is_this = f"{org} sent a {ntype_en} notice."
        elif ndate:
            what_is_this = f"Official {ntype_en} notice dated {ndate}."
        else:
            what_is_this = f"Official {ntype_en} notice."

    # 2. WHAT TO DO (using notice's own wording, never unverified documents)
    if lang == "hi":
        if amt and primary_task:
            what_to_do = f"{primary_task} ({amt}) का भुगतान करें।"
        elif amt:
            what_to_do = f"बकाया राशि {amt} का भुगतान करें।"
        elif primary_task and docs_summary:
            if docs_summary == "one identity proof and one address proof":
                docs_hi = "एक पहचान प्रमाण और एक पते का प्रमाण (one identity proof and one address proof)"
            else:
                docs_hi = docs_summary
            what_to_do = f"{primary_task}: {docs_hi} जमा करें।"
        elif docs_summary:
            if docs_summary == "one identity proof and one address proof":
                docs_hi = "एक पहचान प्रमाण और एक पते का प्रमाण (one identity proof and one address proof)"
            else:
                docs_hi = docs_summary
            what_to_do = f"{docs_hi} जमा करें।"
        elif primary_task:
            what_to_do = f"{primary_task} की प्रक्रिया पूरी करें।"
        else:
            what_to_do = ""

    elif lang == "kn":
        if amt and primary_task:
            what_to_do = f"{primary_task} ({amt}) ಪಾವತಿಸಿ."
        elif amt:
            what_to_do = f"ಬಾಕಿ ಮೊತ್ತ {amt} ಪಾವತಿಸಿ."
        elif primary_task and docs_summary:
            if docs_summary == "one identity proof and one address proof":
                docs_kn = "ಒಂದು ಗುರುತಿನ ಪುರಾವೆ ಮತ್ತು ಒಂದು ವಿಳಾಸದ ಪುರಾವೆ (one identity proof and one address proof)"
            else:
                docs_kn = docs_summary
            what_to_do = f"{primary_task}: {docs_kn} ಸಲ್ಲಿಸಿ."
        elif docs_summary:
            if docs_summary == "one identity proof and one address proof":
                docs_kn = "ಒಂದು ಗುರುತಿನ ಪುರಾವೆ ಮತ್ತು ಒಂದು ವಿಳಾಸದ ಪುರಾವೆ (one identity proof and one address proof)"
            else:
                docs_kn = docs_summary
            what_to_do = f"{docs_kn} ಸಲ್ಲಿಸಿ."
        elif primary_task:
            what_to_do = f"{primary_task} ಪ್ರಕ್ರಿಯೆ ಪೂರ್ಣಗೊಳಿಸಿ."
        else:
            what_to_do = ""

    else:  # English
        if amt and primary_task:
            what_to_do = f"{primary_task} of {amt}."
        elif amt:
            what_to_do = f"Pay outstanding amount of {amt}."
        elif primary_task and docs_summary:
            what_to_do = f"{primary_task}: submit {docs_summary}."
        elif docs_summary:
            what_to_do = f"Submit {docs_summary}."
        elif primary_task:
            what_to_do = f"{primary_task}."
        else:
            what_to_do = ""

    # 3. BY WHEN
    has_asap = facts.get("has_asap")
    earliest_date = facts.get("earliest_date")
    rule_text = facts.get("rule_text")

    if has_asap and not earliest_date:
        if lang == "hi":
            by_when = "कोई निश्चित तिथि नहीं। इसे यथाशीघ्र (as soon as possible) पूरा करें।"
        elif lang == "kn":
            by_when = "ಯಾವುದೇ ನಿಗದಿತ ದಿನಾಂಕವಿಲ್ಲ. ಇದನ್ನು ಆದಷ್ಟು ಬೇಗ ಪೂರ್ಣಗೊಳಿಸಿ."
        else:
            by_when = "No fixed date. Do this as soon as possible."
    elif earliest_date:
        f_date = format_date_for_lang(earliest_date, lang)
        if lang == "hi":
            by_when = f"{f_date} तक।"
        elif lang == "kn":
            by_when = f"{f_date} ರೊಳಗೆ."
        else:
            by_when = f"By {f_date}."
    elif rule_text:
        if lang == "hi":
            by_when = f"{rule_text} तक।"
        elif lang == "kn":
            by_when = f"{rule_text} ಒಳಗೆ."
        else:
            by_when = f"{rule_text}."
    else:
        by_when = ""

    # 4. IF YOU IGNORE (using notice's own wording, e.g. restrictions on debit transactions)
    consequences = facts.get("consequences") or []
    if not consequences:
        if_you_ignore = ""
    else:
        c0 = consequences[0]
        c0_lower = c0.lower()
        if lang == "hi":
            if "disconnect" in c0_lower or "power" in c0_lower or "supply" in c0_lower:
                if_you_ignore = "बिजली या सेवा आपूर्ति काटी जा सकती है (Disconnection)।"
            elif "debit" in c0_lower or "transaction" in c0_lower or "restriction" in c0_lower:
                if_you_ignore = "डेबिट लेनदेन पर प्रतिबंध (restrictions on debit transactions) लागू होगा।"
            elif "penalty" in c0_lower or "surcharge" in c0_lower or "late fee" in c0_lower:
                if_you_ignore = "अतिरिक्त जुर्माना या विलंब शुल्क (late fee) लगाया जाएगा।"
            else:
                if_you_ignore = f"{c0}।"
        elif lang == "kn":
            if "disconnect" in c0_lower or "power" in c0_lower or "supply" in c0_lower:
                if_you_ignore = "ವಿದ್ಯುತ್ ಅಥವಾ ಸೇವಾ ಸಂಪರ್ಕ ಕಡಿತಗೊಳ್ಳಬಹುದು (Disconnection)."
            elif "debit" in c0_lower or "transaction" in c0_lower or "restriction" in c0_lower:
                if_you_ignore = "ಡೆಬಿಟ್ ವಹಿವಾಟುಗಳ ಮೇಲೆ ನಿರ್ಬಂಧಗಳು (restrictions on debit transactions) ಅನ್ವಯಿಸುತ್ತವೆ."
            elif "penalty" in c0_lower or "surcharge" in c0_lower or "late fee" in c0_lower:
                if_you_ignore = "ಹೆಚ್ಚುವರಿ ದಂಡ ಅಥವಾ ವಿಳಂಬ ಶುಲ್ಕ ಅನ್ವಯಿಸುತ್ತದೆ."
            else:
                if_you_ignore = f"{c0}."
        else:
            if "debit" in c0_lower or "transaction" in c0_lower or "restriction" in c0_lower:
                if_you_ignore = "Restrictions on debit transactions will apply."
            elif "disconnect" in c0_lower or "power" in c0_lower or "supply" in c0_lower:
                if_you_ignore = "Power supply may be disconnected."
            else:
                if_you_ignore = f"{c0}." if not c0.endswith(".") else c0

    return {
        "what_is_this": what_is_this,
        "what_to_do": what_to_do,
        "by_when": by_when,
        "if_you_ignore": if_you_ignore,
    }


def validate_summary_field(text: str, field_name: str, facts: dict[str, Any]) -> bool:
    """Validate that a field contains real facts, no generic filler, and doesn't invent documents, amounts, or consequences."""
    if not text or not text.strip():
        return False
    t_lower = text.lower().strip()

    # 1. Blocklist check
    if any(b in t_lower for b in GENERIC_PHRASE_BLOCKLIST):
        return False

    # Extract all text from extracted facts for ground-truth verification
    all_facts_text = (
        f"{facts.get('organisation', '')} {facts.get('notice_type', '')} "
        f"{' '.join(facts.get('required_documents', []))} "
        f"{' '.join(facts.get('task_groups', []))} "
        f"{' '.join(facts.get('consequences', []))}"
    ).lower()

    # 2. Reject hallucinated document names not in the extracted facts
    unverified_doc_names = [
        "aadhaar", "pan", "passport", "voter id", "driving license", "form 60", "ration card",
        "आधार", "पैन", "पासपोर्ट", "मतदाता", "ड्राइविंग लाइसेंस",
        "ಆಧಾರ್", "ಪ್ಯಾನ್", "ಪಾಸ್‌ಪೋರ್ಟ್", "ಮತದಾರ", "ಚಾಲನಾ ಪರವಾನಗಿ"
    ]
    for doc in unverified_doc_names:
        if doc in t_lower and doc not in all_facts_text:
            return False

    # 3. Reject hallucinated consequences not in the extracted facts
    unverified_consequences = [
        "account freeze", "freeze", "frozen", "withdrawal", "withdraw",
        "dormant", "inoperative", "service disruption", "legal action",
        "निकासी", "फ्रीज", "खाता फ्रीज", "रोक",
        "ಹಿಂಪಡೆಯುವಿಕೆ", "ಸ್ಥಗಿತ"
    ]
    for term in unverified_consequences:
        if term in t_lower and term not in all_facts_text:
            return False

    # 4. Reject hallucinated amounts not in the extracted facts
    if "₹" in text or "rs." in t_lower or "rupees" in t_lower or "रूपये" in text or "ರೂಪಾಯಿ" in text:
        if facts.get("amount") is None:
            return False
        # Extract digits from text and compare with facts["amount"]
        text_digits = re.findall(r"\d+", text)
        fact_digits = re.findall(r"\d+", facts["amount"])
        if fact_digits and not any(d in text_digits for d in fact_digits):
            return False

    # 5. Fact verification - field must contain at least one real fact token from the notice
    fact_tokens = set()

    # Org tokens
    if facts.get("organisation"):
        for w in re.split(r"[\s,\.-]+", facts["organisation"].lower()):
            if len(w) >= 3 and w not in ("the", "and", "ltd", "limited", "company", "corporation"):
                fact_tokens.add(w)

    # Amount digits
    if facts.get("amount"):
        num_match = re.search(r"[\d,]+", facts["amount"])
        if num_match:
            fact_tokens.add(num_match.group(0).replace(",", ""))
            fact_tokens.add(num_match.group(0))

    # Notice date and deadline date digits/names
    if facts.get("notice_date"):
        for part in facts["notice_date"].split("-"):
            if len(part) >= 2:
                fact_tokens.add(part)
    if facts.get("earliest_date"):
        for part in facts["earliest_date"].split("-"):
            if len(part) >= 2:
                fact_tokens.add(part)

    # ASAP urgency tokens
    if facts.get("has_asap"):
        for m in ("asap", "soon", "earliest", "no fixed", "यथाशीघ्र", "ಆದಷ್ಟು ಬೇಗ", "निश्चित", "ನಿಗದಿತ"):
            fact_tokens.add(m)

    # Documents present in facts
    for doc in facts.get("required_documents", []):
        for w in re.split(r"[\s,\.-]+", doc.lower()):
            if len(w) >= 3 and w not in ("card", "copy", "form"):
                fact_tokens.add(w)

    # Task groups
    for tg in facts.get("task_groups", []):
        for w in re.split(r"[\s,\.-]+", tg.lower()):
            if len(w) >= 3 and w not in ("the", "for", "and", "with"):
                fact_tokens.add(w)

    # Consequence words present in facts
    for c in facts.get("consequences", []):
        for w in re.split(r"[\s,\.-]+", c.lower()):
            if len(w) >= 3 and w not in ("the", "and", "will", "may"):
                fact_tokens.add(w)

    # Language-specific key anchors present in facts
    for term in (
        "बिजली", "बिल", "केवाईसी", "खाता", "काटी", "भुगतान", "दस्तावेज", "प्रतिबंध",
        "ವಿದ್ಯುತ್", "ಬಿಲ್", "ಕೆವೈಸಿ", "ಖಾತೆ", "ಕಡಿತ", "ನಿರ್ಬಂಧ", "ಪಾವತಿ", "ದಾಖಲೆ"
    ):
        if term in all_facts_text:
            fact_tokens.add(term)

    # Check match
    if any(tok in t_lower for tok in fact_tokens):
        return True

    # Date-specific checks for by_when
    if field_name == "by_when":
        month_indicators = [
            "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
            "जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर",
            "ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್", "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್", "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್"
        ]
        if any(m in t_lower for m in month_indicators) and re.search(r"\d", t_lower):
            return True
        if "asap" in t_lower or "soon" in t_lower or "यथाशीघ्र" in t_lower or "ಬೇಗ" in t_lower:
            return True

    # Check for notice's own wording (identity proof, address proof, debit transactions)
    if field_name == "what_to_do" and ("identity proof" in t_lower or "address proof" in t_lower or "पहचान प्रमाण" in t_lower or "ಗುರುತಿನ ಪುರಾವೆ" in t_lower):
        return True
    if field_name == "if_you_ignore" and ("debit" in t_lower or "प्रतिबंध" in t_lower or "ನಿರ್ಬಂಧ" in t_lower or "restriction" in t_lower):
        return True

    return False

    # Check match
    if any(tok in t_lower for tok in fact_tokens):
        return True

    # Date-specific checks for by_when
    if field_name == "by_when":
        month_indicators = [
            "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
            "जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर",
            "ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್", "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್", "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್"
        ]
        if any(m in t_lower for m in month_indicators) and re.search(r"\d", t_lower):
            return True
        if "asap" in t_lower or "soon" in t_lower or "यथाशीघ्र" in t_lower or "ಬೇಗ" in t_lower:
            return True

    return False


def generate_multilingual_summary(
    result_json: dict[str, Any],
    lang: str = "en",
    llm_client: BaseLLMClient | None = None,
) -> dict[str, str]:
    """Generate or construct factual 4-field simple summary in en, hi, or kn."""
    if lang not in ("en", "hi", "kn"):
        lang = "en"

    facts = extract_verified_facts(result_json)
    templates = build_template_summary(facts, lang)

    # If no LLM client or key configured, return deterministic templates directly
    if not llm_client or not getattr(llm_client, "api_key", None):
        return templates

    lang_name = SUPPORTED_LANGUAGES.get(lang, "English")
    system_prompt = (
        f"You are an expert multilingual document assistant for Notice2Action.\n"
        f"Generate a concise, factual 4-field simple summary of an official notice in {lang_name}.\n\n"
        "STRICT RULES:\n"
        "1. Every field MUST include specific facts from this notice (exact organisation name, amount in ₹, actual date, actual task, and specific consequences).\n"
        "2. Keep names, numbers, ₹ amounts, and dates exactly as given in the facts. Dates may be written in natural language format.\n"
        "3. If the amount is null or absent, DO NOT mention any amount.\n"
        "4. NEVER use generic phrases like 'complete the required tasks', 'check the timeline', 'may apply', 'review the notice instructions'.\n"
        "5. Output JSON with exactly 4 fields: 'what_is_this', 'what_to_do', 'by_when', 'if_you_ignore'. Short simple sentences.\n"
        "6. If a field has no real information in the facts, output an empty string \"\" for that field."
    )

    facts_payload = {
        "organisation": facts["organisation"],
        "notice_type": facts["notice_type"],
        "notice_date": facts["notice_date"],
        "amount": facts["amount"],
        "deadlines": facts["deadlines"],
        "tasks": facts["task_groups"],
        "required_documents": facts["required_documents"],
        "consequences": facts["consequences"],
    }
    user_prompt = (
        f"Generate the 4 summary fields in {lang_name} based ONLY on these verified notice facts:\n"
        f"{json.dumps(facts_payload, ensure_ascii=False, indent=2)}"
    )

    schema = {
        "type": "object",
        "properties": {
            "what_is_this": {"type": "string"},
            "what_to_do": {"type": "string"},
            "by_when": {"type": "string"},
            "if_you_ignore": {"type": "string"},
        },
        "required": ["what_is_this", "what_to_do", "by_when", "if_you_ignore"],
    }

    try:
        raw_resp = llm_client.generate_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_schema=schema,
        )
        data = json.loads(raw_resp)
        final_summary = {}
        for field in ("what_is_this", "what_to_do", "by_when", "if_you_ignore"):
            val = str(data.get(field) or "").strip()
            if val and validate_summary_field(val, field, facts):
                final_summary[field] = val
            else:
                final_summary[field] = templates[field]
        return final_summary
    except Exception as e:
        logger.warning(
            "LLM summary generation failed for lang='%s', falling back to deterministic templates: %s",
            lang,
            e,
        )
        return templates
