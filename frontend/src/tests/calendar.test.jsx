import { describe, it, expect, vi } from "vitest";
import {
  escapeIcsText,
  formatCalendarDates,
  formatIcsEventDates,
  generateIcsContent,
  getGoogleCalendarUrl,
  triggerIcsDownload,
} from "../utils/calendar";

describe("calendar utilities", () => {
  it("escapes special characters for RFC 5545 and handles empty text", () => {
    expect(escapeIcsText("Hello, World; test\\run\nNew line")).toBe(
      "Hello\\, World\\; test\\\\run\\nNew line"
    );
    expect(escapeIcsText("")).toBe("");
    expect(escapeIcsText(null)).toBe("");
  });

  it("formats date-only events for both branch APIs with an exclusive next-day end", () => {
    const legacyDates = formatCalendarDates("2026-12-31");
    const currentDates = formatIcsEventDates("2026-12-31");

    expect(legacyDates).toEqual({
      isAllDay: true,
      dtStart: "VALUE=DATE:20261231",
      dtEnd: "VALUE=DATE:20270101",
      googleDates: "20261231/20270101",
    });
    expect(currentDates).toEqual({
      isDateOnly: true,
      dtStart: "20261231",
      dtEnd: "20270101",
    });
  });

  it("formats timed ISO events in UTC", () => {
    expect(formatCalendarDates("2026-11-15T10:00:00Z")).toEqual({
      isAllDay: false,
      dtStart: "20261115T100000Z",
      dtEnd: "20261115T110000Z",
      googleDates: "20261115T100000Z/20261115T110000Z",
    });
  });

  it("rejects missing, invalid, and relative dates", () => {
    for (const date of [
      "",
      null,
      "not-a-date",
      "within 15 days",
      "2026-02-31",
      "2026-02-31T12:00:00Z",
    ]) {
      expect(formatCalendarDates(date)).toBeNull();
      expect(formatIcsEventDates(date)).toBeNull();
    }
    expect(
      generateIcsContent({ title: "Invalid Notice", dateStr: "2026-02-31" })
    ).toBeNull();
  });

  it("generates all-day iCalendar content with CRLF line endings and escaped text", () => {
    const ics = generateIcsContent({
      title: "Property Tax, Payment",
      description: "Pay by 31-12-2026; use portal",
      dateStr: "2026-12-31",
      noticeId: "tax-123",
    });

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("PRODID:-//Notice2Action//Institutional Notice Management//EN\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101\r\n");
    expect(ics).toContain("SUMMARY:Property Tax\\, Payment\r\n");
    expect(ics).toContain("DESCRIPTION:Pay by 31-12-2026\\; use portal\r\n");
    expect(ics).toContain("END:VEVENT\r\nEND:VCALENDAR\r\n");
  });

  it("generates Google Calendar URLs for all-day deadlines", () => {
    const url = getGoogleCalendarUrl({
      title: "Scholarship Renewal",
      description: "Submit documents online",
      dateStr: "2026-11-15",
    });

    expect(url).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(url).toContain("text=Scholarship%20Renewal");
    expect(url).toContain("dates=20261115/20261116");
    expect(url).toContain("details=Submit%20documents%20online");
  });

  it("triggers download through a temporary anchor and revokes its object URL", () => {
    const createObjectUrl = vi.fn(() => "blob:mock-url");
    const revokeObjectUrl = vi.fn();
    const createDescriptor = Object.getOwnPropertyDescriptor(
      window.URL,
      "createObjectURL"
    );
    const revokeDescriptor = Object.getOwnPropertyDescriptor(
      window.URL,
      "revokeObjectURL"
    );
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    try {
      triggerIcsDownload("deadline.ics", "BEGIN:VCALENDAR\r\nEND:VCALENDAR");
      expect(createObjectUrl).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:mock-url");
    } finally {
      clickSpy.mockRestore();
      if (createDescriptor) {
        Object.defineProperty(window.URL, "createObjectURL", createDescriptor);
      } else {
        delete window.URL.createObjectURL;
      }
      if (revokeDescriptor) {
        Object.defineProperty(window.URL, "revokeObjectURL", revokeDescriptor);
      } else {
        delete window.URL.revokeObjectURL;
      }
    }
  });
});
