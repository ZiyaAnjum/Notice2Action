"""iCalendar (.ics) generation service conforming to RFC 5545.

Generates structured calendar events from extracted official notice deadlines
with proper character escaping, line folding, timezone handling, and reminder alarms.
"""

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.app.models.notice import NoticeModel


class CalendarExportError(Exception):
    """Raised when a notice has no exportable calendar deadlines."""

    def __init__(self, message: str, error_code: str = "NO_CALENDAR_EVENTS") -> None:
        super().__init__(message)
        self.message = message
        self.error_code = error_code


def escape_ics_text(value: str | None) -> str:
    """Escape special characters in text values per RFC 5545 section 3.3.11."""
    if not value:
        return ""
    text = str(value)
    text = text.replace("\\", "\\\\")
    text = text.replace(";", "\\;")
    text = text.replace(",", "\\,")
    text = text.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n")
    return text


def fold_ics_line(line: str) -> str:
    """Fold lines to <= 75 octets per RFC 5545 section 3.1."""
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line

    lines = []
    current = ""
    for char in line:
        candidate = current + char
        if len(candidate.encode("utf-8")) > 75:
            lines.append(current)
            current = " " + char
        else:
            current = candidate
    if current:
        lines.append(current)
    return "\r\n".join(lines)


def parse_deadline_date(raw_date: Any) -> tuple[date | datetime | None, bool]:
    """Parse a deadline date string into a date or datetime object.

    Returns:
        Tuple of (parsed_object or None, has_explicit_timezone: bool)
    """
    if not raw_date:
        return None, False

    if isinstance(raw_date, datetime):
        return raw_date, raw_date.tzinfo is not None

    if isinstance(raw_date, date):
        return raw_date, False

    if not isinstance(raw_date, str):
        return None, False

    s = raw_date.strip()
    if s.lower() in ("uncertain", "not_found", "none", "null", "tbd", "pending", ""):
        return None, False

    # 1. Try ISO 8601 date-only first (YYYY-MM-DD)
    try:
        d = date.fromisoformat(s)
        return d, False
    except ValueError:
        pass

    # 2. Try ISO 8601 datetime with timezone or floating (e.g. YYYY-MM-DDTHH:MM:SS)
    try:
        dt = datetime.fromisoformat(s)
        has_tz = dt.tzinfo is not None
        return dt, has_tz
    except ValueError:
        pass

    # 3. Try common date patterns (DD-MM-YYYY, DD/MM/YYYY, etc.)
    for fmt in (
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%d %B %Y",
        "%d %b %Y",
    ):
        try:
            d = datetime.strptime(s, fmt).date()
            return d, False
        except ValueError:
            pass

    # 4. Try common datetime patterns
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
    ):
        try:
            dt = datetime.strptime(s, fmt)
            return dt, False
        except ValueError:
            pass

    # 5. Check if date begins with YYYY-MM-DD (e.g., date followed by extra text)
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if match:
        try:
            return date.fromisoformat(match.group(1)), False
        except ValueError:
            pass

    return None, False


class CalendarService:
    """Generates RFC 5545 iCalendar data for notice deadlines."""

    def __init__(self, prod_id: str = "-//Action4AI//Notice to Action//EN") -> None:
        self.prod_id = prod_id

    def generate_notice_calendar(
        self,
        notice: NoticeModel,
        reminder_days_before: int = 1,
    ) -> str:
        """Generate a complete .ics calendar string for a notice.

        Args:
            notice: NoticeModel instance with extracted result_json and metadata.
            reminder_days_before: Days prior to deadline to trigger the VALARM.

        Returns:
            Valid RFC 5545 formatted .ics file string with CRLF endings.

        Raises:
            CalendarExportError: If no valid exportable deadlines exist.
        """
        result = notice.result_json or {}
        deadlines = result.get("deadlines") or []

        # Filter valid, non-uncertain deadlines
        valid_events: list[dict[str, Any]] = []

        for idx, dl in enumerate(deadlines):
            raw_date = dl.get("date")
            parsed_dt, has_tz = parse_deadline_date(raw_date)

            # Skip missing, uncertain, or unparseable dates
            if parsed_dt is None:
                continue

            # Skip explicitly marked ambiguous/conflicting without a concrete date
            if dl.get("status") in ("uncertain", "not_found") or raw_date == "uncertain":
                continue

            valid_events.append({
                "index": idx,
                "parsed": parsed_dt,
                "has_tz": has_tz,
                "raw_deadline": dl,
            })

        if not valid_events:
            raise CalendarExportError(
                message=f"Notice '{notice.id}' has no valid or confirmed calendar deadlines to export.",
                error_code="NO_CALENDAR_EVENTS",
            )

        now_utc = datetime.now(timezone.utc)
        dtstamp = now_utc.strftime("%Y%m%dT%H%M%SZ")

        # Resolve notice title safely
        title_obj = result.get("notice_title")
        raw_title = (
            title_obj.get("text")
            if isinstance(title_obj, dict)
            else (title_obj if isinstance(title_obj, str) else None)
        )
        if raw_title and raw_title.strip() and raw_title.strip().lower() not in ("not_found", "uncertain"):
            notice_title = raw_title.strip()
        elif notice.original_filename:
            notice_title = notice.original_filename
        else:
            notice_title = f"Notice {notice.id}"

        issuer_obj = result.get("issuing_organisation")
        issuer = (
            issuer_obj.get("text")
            if isinstance(issuer_obj, dict)
            else (issuer_obj if isinstance(issuer_obj, str) else None)
        )

        purpose_obj = result.get("main_purpose")
        main_purpose = (
            purpose_obj.get("text")
            if isinstance(purpose_obj, dict)
            else (purpose_obj if isinstance(purpose_obj, str) else None)
        )

        lines: list[str] = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            f"PRODID:{self.prod_id}",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            f"X-WR-CALNAME:{escape_ics_text(notice_title)} Deadlines",
        ]

        for item in valid_events:
            idx = item["index"]
            parsed = item["parsed"]
            has_tz = item["has_tz"]
            dl = item["raw_deadline"]

            uid = f"{notice.id}-deadline-{idx}@noticetoaction.app"
            dl_desc = dl.get("description") or "Notice compliance deadline"
            page = dl.get("source_page")
            quote = dl.get("evidence_quote")

            # Format Summary
            summary_text = f"{notice_title}: {dl_desc}"
            escaped_summary = escape_ics_text(summary_text)

            # Format Description
            desc_parts = [
                f"Notice: {notice_title}",
                f"Notice ID: {notice.id}",
            ]
            if issuer and issuer != "not_found":
                desc_parts.append(f"Issuing Authority: {issuer}")
            if main_purpose and main_purpose != "not_found":
                desc_parts.append(f"Purpose: {main_purpose}")
            desc_parts.append(f"Deadline Action: {dl_desc}")
            if page and str(page) not in ("not_found", "uncertain"):
                desc_parts.append(f"Source Page: Page {page}")
            if quote and str(quote) not in ("not_found", "uncertain"):
                desc_parts.append(f'Citation: "{quote}"')

            if isinstance(parsed, datetime) and not has_tz:
                desc_parts.append("Timezone: Floating (local time; notice did not specify a timezone)")

            escaped_desc = escape_ics_text("\n\n".join(desc_parts))

            event_lines = [
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTAMP:{dtstamp}",
                f"SUMMARY:{escaped_summary}",
                f"DESCRIPTION:{escaped_desc}",
                f"X-NOTICE-ID:{notice.id}",
            ]

            # Format Dates
            if isinstance(parsed, datetime):
                if has_tz:
                    # Convert to UTC
                    utc_dt = parsed.astimezone(timezone.utc)
                    start_str = utc_dt.strftime("%Y%m%dT%H%M%SZ")
                    end_dt = utc_dt + timedelta(hours=1)
                    end_str = end_dt.strftime("%Y%m%dT%H%M%SZ")
                    event_lines.append(f"DTSTART:{start_str}")
                    event_lines.append(f"DTEND:{end_str}")
                else:
                    # Floating local time (RFC 5545 section 3.3.5)
                    start_str = parsed.strftime("%Y%m%dT%H%M%S")
                    end_dt = parsed + timedelta(hours=1)
                    end_str = end_dt.strftime("%Y%m%dT%H%M%S")
                    event_lines.append(f"DTSTART:{start_str}")
                    event_lines.append(f"DTEND:{end_str}")
            else:
                # Date-only all day event
                start_str = parsed.strftime("%Y%m%d")
                end_date = parsed + timedelta(days=1)
                end_str = end_date.strftime("%Y%m%d")
                event_lines.append(f"DTSTART;VALUE=DATE:{start_str}")
                event_lines.append(f"DTEND;VALUE=DATE:{end_str}")

            # Add Reminder Alarm (VALARM)
            alarm_summary = escape_ics_text(f"Reminder: {summary_text}")
            event_lines.extend([
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                f"DESCRIPTION:{alarm_summary}",
                f"TRIGGER:-P{max(1, reminder_days_before)}D",
                "END:VALARM",
            ])

            event_lines.append("END:VEVENT")
            lines.extend(event_lines)

        lines.append("END:VCALENDAR")

        # Fold lines and join with RFC 5545 CRLF
        folded_lines = [fold_ics_line(line_item) for line_item in lines]
        return "\r\n".join(folded_lines) + "\r\n"


calendar_service = CalendarService()
