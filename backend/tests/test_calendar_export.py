"""Comprehensive tests for Calendar Export (.ics) endpoint and RFC 5545 compliance.

Covers:
1. One valid deadline.
2. Multiple deadlines.
3. Correct event title and description.
4. Date/time and timezone handling (date-only, UTC, floating).
5. Special-character escaping (commas, semicolons, backslashes, newlines).
6. Unique event UIDs.
7. Reminder alarms (VALARM).
8. Missing deadlines (returns 400 NO_CALENDAR_EVENTS).
9. Invalid or uncertain dates (skipped; returns 400 if none remain).
10. Nonexistent notice (returns 404 NOTICE_NOT_FOUND).
11. Correct response content type (text/calendar; charset=utf-8).
12. Correct downloadable filename (Content-Disposition: attachment; filename="notice-{id}.ics").
13. Valid CRLF line endings and 75-octet line folding.
"""

from collections.abc import Generator
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app.models.notice import NoticeModel
from backend.app.rate_limiter import upload_rate_limiter
from backend.app.services.calendar_service import (
    escape_ics_text,
    fold_ics_line,
    parse_deadline_date,
)
from backend.app.services.notice_service import notice_service


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path: Path) -> Generator[None, None, None]:
    """Provide isolated test SQLite database for calendar export tests."""
    upload_rate_limiter.reset()

    test_db_path = tmp_path / "test_calendar.db"
    test_engine = create_engine(
        f"sqlite:///{test_db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    orig_session_factory = notice_service.session_factory
    orig_upload_dir = notice_service.upload_dir
    notice_service.session_factory = TestingSessionLocal
    notice_service.upload_dir = tmp_path / "uploads"
    notice_service.upload_dir.mkdir(parents=True, exist_ok=True)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield

    app.dependency_overrides.clear()
    notice_service.session_factory = orig_session_factory
    notice_service.upload_dir = orig_upload_dir
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _create_test_notice(
    notice_id: str,
    deadlines: list[dict[str, Any]] | None = None,
    title: str = "Scholarship Renewal Notice",
    issuer: str = "Ministry of Education",
    purpose: str = "Submit renewal application with semester grades",
    status: str = "completed",
) -> NoticeModel:
    """Helper to persist a test notice with structured result_json."""
    session = notice_service.session_factory()
    try:
        result_json = {
            "notice_title": {"text": title, "status": "found"},
            "issuing_organisation": {"text": issuer, "status": "found"},
            "main_purpose": {"text": purpose, "status": "found"},
            "deadlines": deadlines or [],
        }
        notice = NoticeModel(
            id=notice_id,
            original_filename="sample_notice.pdf",
            stored_path=str(notice_service.upload_dir / f"{notice_id}.pdf"),
            status=status,
            current_stage="completed" if status == "completed" else "uploaded",
            progress=100 if status == "completed" else 0,
            result_json=result_json,
        )
        session.add(notice)
        session.commit()
        session.refresh(notice)
        return notice
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Unit tests for calendar_service helpers
# ---------------------------------------------------------------------------

def test_escape_ics_text() -> None:
    """Verify special characters (comma, semicolon, backslash, newline) are escaped."""
    assert escape_ics_text(None) == ""
    assert escape_ics_text("") == ""
    assert escape_ics_text("Normal Text") == "Normal Text"

    raw = "Item 1, Item 2; path\\to\\file\nSecond line\r\nThird line"
    escaped = escape_ics_text(raw)
    assert r"\," in escaped
    assert r"\;" in escaped
    assert r"\\" in escaped
    assert r"\n" in escaped
    assert "\r" not in escaped
    assert "\n" not in escaped.replace(r"\n", "")


def test_fold_ics_line_within_75_octets() -> None:
    """Verify short lines are not folded."""
    short = "SUMMARY:Annual General Meeting"
    assert fold_ics_line(short) == short


def test_fold_ics_line_exceeding_75_octets() -> None:
    """Verify long lines are folded at 75-octet boundaries with CRLF and leading space."""
    long_line = "DESCRIPTION:" + ("X" * 160)
    folded = fold_ics_line(long_line)

    lines = folded.split("\r\n")
    assert len(lines) >= 3
    # First chunk <= 75 bytes
    assert len(lines[0].encode("utf-8")) <= 75
    # Continuation lines start with space and <= 75 bytes
    for cont in lines[1:]:
        assert cont.startswith(" ")
        assert len(cont.encode("utf-8")) <= 75


def test_parse_deadline_date_variants() -> None:
    """Verify parser handles date-only, ISO datetime, common formats, and uncertain dates."""
    # 1. Date only
    d, has_tz = parse_deadline_date("2026-04-15")
    assert d == date(2026, 4, 15)
    assert not isinstance(d, datetime)
    assert not has_tz

    # 2. ISO datetime UTC
    dt_utc, has_tz = parse_deadline_date("2026-04-15T17:00:00Z")
    assert isinstance(dt_utc, datetime)
    assert has_tz is True
    assert dt_utc.tzinfo is not None

    # 3. ISO datetime with offset
    dt_off, has_tz = parse_deadline_date("2026-04-15T17:00:00+05:30")
    assert isinstance(dt_off, datetime)
    assert has_tz is True

    # 4. Floating datetime (no timezone)
    dt_float, has_tz = parse_deadline_date("2026-04-15T17:00:00")
    assert isinstance(dt_float, datetime)
    assert has_tz is False
    assert dt_float.tzinfo is None

    # 5. Common formats (DD-MM-YYYY, DD/MM/YYYY)
    d_slash, _ = parse_deadline_date("15/04/2026")
    assert d_slash == date(2026, 4, 15)

    d_dash, _ = parse_deadline_date("15-04-2026")
    assert d_dash == date(2026, 4, 15)

    # 6. Uncertain / unparseable
    assert parse_deadline_date("uncertain")[0] is None
    assert parse_deadline_date("not_found")[0] is None
    assert parse_deadline_date("tbd")[0] is None
    assert parse_deadline_date("")[0] is None
    assert parse_deadline_date(None)[0] is None


# ---------------------------------------------------------------------------
# Integration tests for GET /api/notices/{id}/calendar
# ---------------------------------------------------------------------------

def test_calendar_export_single_deadline(client: TestClient) -> None:
    """Requirement 1: Verify export for a single valid deadline."""
    deadlines = [
        {
            "date": "2026-05-30",
            "description": "Submit final renewal documents",
            "source_page": 2,
            "evidence_quote": "All documents must be received by May 30, 2026.",
            "status": "found",
        }
    ]
    notice = _create_test_notice("notice-single-dl", deadlines=deadlines)

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200

    ics = res.text
    # RFC 5545 envelope
    assert "BEGIN:VCALENDAR\r\n" in ics
    assert "END:VCALENDAR\r\n" in ics
    assert "VERSION:2.0\r\n" in ics
    assert "PRODID:-//Action4AI//Notice to Action//EN\r\n" in ics

    # Exactly one VEVENT
    assert ics.count("BEGIN:VEVENT") == 1
    assert ics.count("END:VEVENT") == 1

    # Date-only all day formatting
    assert "DTSTART;VALUE=DATE:20260530" in ics
    assert "DTEND;VALUE=DATE:20260531" in ics


def test_calendar_export_multiple_deadlines(client: TestClient) -> None:
    """Requirement 2: Verify export with multiple distinct deadlines."""
    deadlines = [
        {
            "date": "2026-04-15",
            "description": "Initial application submission",
            "source_page": 1,
            "evidence_quote": "Step 1 due April 15, 2026",
            "status": "found",
        },
        {
            "date": "2026-05-01",
            "description": "Verification of attested certificates",
            "source_page": 2,
            "evidence_quote": "Certificates due May 1, 2026",
            "status": "found",
        },
        {
            "date": "2026-06-15",
            "description": "Final fee disbursement deadline",
            "source_page": 3,
            "evidence_quote": "Disbursement window closes June 15, 2026",
            "status": "found",
        },
    ]
    notice = _create_test_notice("notice-multi-dl", deadlines=deadlines)

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200

    ics = res.text
    assert ics.count("BEGIN:VEVENT") == 3
    assert ics.count("END:VEVENT") == 3

    # Check that each event date is represented
    assert "DTSTART;VALUE=DATE:20260415" in ics
    assert "DTSTART;VALUE=DATE:20260501" in ics
    assert "DTSTART;VALUE=DATE:20260615" in ics


def test_calendar_event_title_and_description(client: TestClient) -> None:
    """Requirement 3: Verify SUMMARY and detailed DESCRIPTION fields."""
    deadlines = [
        {
            "date": "2026-07-20",
            "description": "Submit Income Tax Assessment",
            "source_page": 4,
            "evidence_quote": "Assessment orders must be uploaded via the portal.",
            "status": "found",
        }
    ]
    notice = _create_test_notice(
        "notice-desc-test",
        deadlines=deadlines,
        title="Income Tax Compliance Order",
        issuer="Central Board of Direct Taxes",
        purpose="Filing annual reassessment compliance",
    )

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200

    ics = res.text
    # Unfold RFC 5545 lines for logical content assertions
    unfolded = ics.replace("\r\n ", "").replace("\r\n\t", "")

    assert "SUMMARY:Income Tax Compliance Order: Submit Income Tax Assessment" in unfolded
    assert "Notice: Income Tax Compliance Order" in unfolded
    assert "Notice ID: notice-desc-test" in unfolded
    assert "Issuing Authority: Central Board of Direct Taxes" in unfolded
    assert "Purpose: Filing annual reassessment compliance" in unfolded
    assert "Source Page: Page 4" in unfolded
    assert 'Citation: "Assessment orders must be uploaded via the portal."' in unfolded


def test_calendar_timezone_handling_utc_and_floating(client: TestClient) -> None:
    """Requirement 4: Verify UTC datetimes use Z and floating datetimes use local time with description."""
    deadlines = [
        {
            "date": "2026-08-10T14:30:00Z",
            "description": "UTC timed hearing",
            "status": "found",
        },
        {
            "date": "2026-09-01T10:00:00",
            "description": "Floating timed appointment",
            "status": "found",
        },
    ]
    notice = _create_test_notice("notice-tz-test", deadlines=deadlines)

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200

    ics = res.text
    # Event 1: UTC with Z
    assert "DTSTART:20260810T143000Z" in ics
    assert "DTEND:20260810T153000Z" in ics

    # Event 2: Floating local time (no Z) and explanation in description
    assert "DTSTART:20260901T100000\r\n" in ics
    assert "DTEND:20260901T110000\r\n" in ics
    assert "Floating (local time" in ics


def test_calendar_special_character_escaping(client: TestClient) -> None:
    """Requirement 5: Verify commas, semicolons, backslashes, and quotes are escaped."""
    deadlines = [
        {
            "date": "2026-10-15",
            "description": "Action: Verify; pay fees, submit receipt\\records",
            "evidence_quote": "Pay $100; submit form, receipt.",
            "status": "found",
        }
    ]
    notice = _create_test_notice(
        "notice-escape-test",
        deadlines=deadlines,
        title="Notice: Department, Sub-Unit; Ref #123",
    )

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200

    ics = res.text
    # Escaped semicolon and comma in summary/description
    assert r"\;" in ics
    assert r"\," in ics
    assert r"\\" in ics


def test_calendar_unique_event_uids(client: TestClient) -> None:
    """Requirement 6: Verify each VEVENT has a unique UID containing notice ID and index."""
    deadlines = [
        {"date": "2026-11-01", "description": "Step 1", "status": "found"},
        {"date": "2026-11-15", "description": "Step 2", "status": "found"},
    ]
    notice = _create_test_notice("notice-uid-test", deadlines=deadlines)

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200

    ics = res.text
    uid0 = "UID:notice-uid-test-deadline-0@noticetoaction.app"
    uid1 = "UID:notice-uid-test-deadline-1@noticetoaction.app"
    assert uid0 in ics
    assert uid1 in ics
    assert uid0 != uid1


def test_calendar_reminder_alarms(client: TestClient) -> None:
    """Requirement 7: Verify each VEVENT includes a standard VALARM reminder."""
    deadlines = [
        {"date": "2026-12-01", "description": "Submission deadline", "status": "found"},
        {"date": "2026-12-15", "description": "Hearing deadline", "status": "found"},
    ]
    notice = _create_test_notice("notice-alarm-test", deadlines=deadlines)

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200

    ics = res.text
    # Each event has a VALARM block
    assert ics.count("BEGIN:VALARM") == 2
    assert ics.count("ACTION:DISPLAY") == 2
    assert ics.count("TRIGGER:-P1D") == 2
    assert ics.count("END:VALARM") == 2


def test_calendar_missing_deadlines_returns_400(client: TestClient) -> None:
    """Requirement 8: Verify notice with empty or missing deadlines returns HTTP 400."""
    notice = _create_test_notice("notice-empty-dl", deadlines=[])

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 400
    data = res.json()
    assert data["error"] == "NO_CALENDAR_EVENTS"
    assert "no valid or confirmed calendar deadlines" in data["message"].lower()


def test_calendar_invalid_or_uncertain_dates_skipped(client: TestClient) -> None:
    """Requirement 9: Verify uncertain dates are skipped; if none valid, returns 400."""
    # Case A: Only uncertain deadlines -> returns 400
    deadlines_all_uncertain = [
        {"date": "uncertain", "description": "Unknown date action", "status": "uncertain"},
        {"date": "not_found", "description": "Missing date action", "status": "not_found"},
        {"date": "pending clarification", "description": "Unparseable", "status": "found"},
    ]
    notice_uncertain = _create_test_notice("notice-uncertain-only", deadlines=deadlines_all_uncertain)
    res_unc = client.get(f"/api/notices/{notice_uncertain.id}/calendar")
    assert res_unc.status_code == 400
    assert res_unc.json()["error"] == "NO_CALENDAR_EVENTS"

    # Case B: Mixed deadlines (1 valid, 2 uncertain) -> only valid 1 exported
    deadlines_mixed = [
        {"date": "uncertain", "description": "Unknown date action", "status": "uncertain"},
        {"date": "2026-08-25", "description": "Firm payment deadline", "status": "found"},
        {"date": "not_found", "description": "Missing date", "status": "not_found"},
    ]
    notice_mixed = _create_test_notice("notice-mixed-dl", deadlines=deadlines_mixed)
    res_mix = client.get(f"/api/notices/{notice_mixed.id}/calendar")
    assert res_mix.status_code == 200
    assert res_mix.text.count("BEGIN:VEVENT") == 1
    assert "DTSTART;VALUE=DATE:20260825" in res_mix.text
    assert "Firm payment deadline" in res_mix.text


def test_calendar_nonexistent_notice_returns_404(client: TestClient) -> None:
    """Requirement 10: Verify nonexistent notice ID returns HTTP 404."""
    res = client.get("/api/notices/nonexistent-uuid-9999/calendar")
    assert res.status_code == 404
    data = res.json()
    assert data["error"] == "NOTICE_NOT_FOUND"


def test_calendar_content_type_header(client: TestClient) -> None:
    """Requirement 11: Verify response Content-Type is text/calendar; charset=utf-8."""
    deadlines = [{"date": "2026-06-30", "description": "Year end", "status": "found"}]
    notice = _create_test_notice("notice-ct-test", deadlines=deadlines)

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200
    content_type = res.headers.get("content-type", "")
    assert "text/calendar" in content_type
    assert "charset=utf-8" in content_type


def test_calendar_downloadable_filename(client: TestClient) -> None:
    """Requirement 12: Verify Content-Disposition attachment with safe filename."""
    deadlines = [{"date": "2026-06-30", "description": "Year end", "status": "found"}]
    notice = _create_test_notice("notice-dl-name-123", deadlines=deadlines)

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200
    disposition = res.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert 'filename="notice-notice-dl-name-123.ics"' in disposition


def test_calendar_crlf_endings_and_line_folding(client: TestClient) -> None:
    """Requirement 13: Verify RFC 5545 mandatory CRLF endings and no line exceeding 75 octets."""
    deadlines = [
        {
            "date": "2026-07-01",
            "description": "Submit exceptionally long multi-paragraph compliance brief with all citations: " + ("A" * 200),
            "evidence_quote": "Detailed quote from page 5 with extended historical references: " + ("B" * 200),
            "source_page": 5,
            "status": "found",
        }
    ]
    notice = _create_test_notice("notice-folding-test", deadlines=deadlines)

    res = client.get(f"/api/notices/{notice.id}/calendar")
    assert res.status_code == 200

    raw_bytes = res.content
    # RFC 5545 section 3.1: Lines are terminated by CRLF
    assert b"\r\n" in raw_bytes
    # No bare LF without CR
    assert raw_bytes.replace(b"\r\n", b"").find(b"\n") == -1

    # Check each individual folded line is <= 75 octets
    raw_lines = raw_bytes.split(b"\r\n")
    for idx, raw_line in enumerate(raw_lines):
        assert len(raw_line) <= 75, f"Line {idx} exceeds 75 octets: {len(raw_line)} bytes -> {raw_line!r}"
