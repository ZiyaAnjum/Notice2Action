import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  escapeIcsText,
  formatCalendarDates,
  generateIcsContent,
  getGoogleCalendarUrl,
  triggerIcsDownload,
} from "../utils/calendar";

describe("calendar utilities", () => {
  it("escapes special characters for RFC 5545 compliance", () => {
    expect(escapeIcsText("Hello, World; test\\run\nNew line")).toBe(
      "Hello\\, World\\; test\\\\run\\nNew line"
    );
    expect(escapeIcsText("")).toBe("");
    expect(escapeIcsText(null)).toBe("");
  });

  describe("formatCalendarDates", () => {
    it("handles date-only values as all-day events with next-day DTEND without assuming time", () => {
      const result = formatCalendarDates("2026-12-31");
      expect(result).not.toBeNull();
      expect(result.isAllDay).toBe(true);
      expect(result.dtStart).toBe("VALUE=DATE:20261231");
      expect(result.dtEnd).toBe("VALUE=DATE:20270101");
      expect(result.googleDates).toBe("20261231/20270101");
    });

    it("handles timed ISO strings in UTC format", () => {
      const result = formatCalendarDates("2026-11-15T10:00:00Z");
      expect(result).not.toBeNull();
      expect(result.isAllDay).toBe(false);
      expect(result.dtStart).toBe("20261115T100000Z");
      expect(result.dtEnd).toBe("20261115T110000Z");
      expect(result.googleDates).toBe("20261115T100000Z/20261115T110000Z");
    });

    it("returns null for invalid or non-date strings", () => {
      expect(formatCalendarDates("")).toBeNull();
      expect(formatCalendarDates(null)).toBeNull();
      expect(formatCalendarDates("not-a-date")).toBeNull();
      expect(formatCalendarDates("within 15 days")).toBeNull();
      expect(formatCalendarDates("2026-02-31")).toBeNull();
    });
  });

  describe("generateIcsContent", () => {
    it("creates valid RFC 5545 iCalendar content with CRLF line breaks", () => {
      const ics = generateIcsContent({
        title: "Property Tax Payment",
        description: "Payment must be received on or before 31-12-2026",
        dateStr: "2026-12-31",
        noticeId: "tax-123",
      });

      expect(ics).not.toBeNull();
      expect(ics).toContain("BEGIN:VCALENDAR\r\n");
      expect(ics).toContain("VERSION:2.0\r\n");
      expect(ics).toContain("PRODID:-//Action4AI//Notice to Action//EN\r\n");
      expect(ics).toContain("BEGIN:VEVENT\r\n");
      expect(ics).toContain("DTSTART;VALUE=DATE:20261231\r\n");
      expect(ics).toContain("DTEND;VALUE=DATE:20270101\r\n");
      expect(ics).toContain("SUMMARY:Property Tax Payment\r\n");
      expect(ics).toContain(
        "DESCRIPTION:Payment must be received on or before 31-12-2026\r\n"
      );
      expect(ics).toContain("END:VEVENT\r\n");
      expect(ics).toContain("END:VCALENDAR");
    });

    it("returns null when date is invalid", () => {
      const ics = generateIcsContent({
        title: "Invalid Notice",
        dateStr: "invalid-date",
      });
      expect(ics).toBeNull();
    });
  });

  describe("getGoogleCalendarUrl", () => {
    it("generates correct Google Calendar template URL for all-day deadline", () => {
      const url = getGoogleCalendarUrl({
        title: "Scholarship Renewal",
        description: "Submit documents online",
        dateStr: "2026-11-15",
      });

      expect(url).not.toBeNull();
      expect(url).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
      expect(url).toContain("text=Scholarship%20Renewal");
      expect(url).toContain("dates=20261115/20261116");
      expect(url).toContain("details=Submit%20documents%20online");
    });
  });

  describe("triggerIcsDownload", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("triggers file download using Blob and temporary link in browser environment", () => {
      const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
      const mockRevokeObjectURL = vi.fn();
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      triggerIcsDownload("deadline.ics", "BEGIN:VCALENDAR\r\nEND:VCALENDAR");

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

      clickSpy.mockRestore();
    });
  });
});
