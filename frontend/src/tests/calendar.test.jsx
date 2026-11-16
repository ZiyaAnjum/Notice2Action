import { describe, it, expect, vi } from "vitest";
import {
  escapeIcsText,
  formatIcsEventDates,
  generateIcsContent,
  getGoogleCalendarUrl,
  triggerIcsDownload,
} from "../utils/calendar";

describe("calendar utilities", () => {
  it("escapes special characters per RFC 5545", () => {
    expect(escapeIcsText("Hello, World; Testing\\Escape\nLine")).toBe(
      "Hello\\, World\\; Testing\\\\Escape\\nLine"
    );
  });

  it("formats date-only values into VALUE=DATE properties with next-day DTEND", () => {
    const dates = formatIcsEventDates("2026-11-20");
    expect(dates).not.toBeNull();
    expect(dates.isDateOnly).toBe(true);
    expect(dates.dtStart).toBe("20261120");
    expect(dates.dtEnd).toBe("20261121");
  });

  it("generates RFC 5545 compliant .ics content with CRLF line endings", () => {
    const ics = generateIcsContent({
      title: "Council Tax Payment",
      description: "Must pay before cutoff",
      dateStr: "2026-11-20",
      noticeId: "notice-456",
    });

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261121\r\n");
    expect(ics).toContain("SUMMARY:Council Tax Payment\r\n");
    expect(ics).toContain("END:VCALENDAR\r\n");
  });

  it("constructs valid Google Calendar URLs", () => {
    const url = getGoogleCalendarUrl({
      title: "Scholarship Form",
      description: "Submit docs online",
      dateStr: "2026-11-30",
    });

    expect(url).toContain("https://calendar.google.com/calendar/render");
    expect(url).toContain("text=Scholarship%20Form");
    expect(url).toContain("dates=20261130/20261201");
  });

  it("triggers download by creating and clicking anchor element", () => {
    const mockClick = vi.fn();
    const originalCreate = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = originalCreate(tag);
      if (tag === "a") {
        el.click = mockClick;
      }
      return el;
    });

    global.URL.createObjectURL = vi.fn(() => "blob:test-url");
    global.URL.revokeObjectURL = vi.fn();

    triggerIcsDownload("test-event.ics", "BEGIN:VCALENDAR...");

    expect(mockClick).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

