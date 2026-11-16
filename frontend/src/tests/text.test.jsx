import { describe, it, expect } from "vitest";
import { formatDate, getCountdownDetails } from "../utils/text";

describe("text and date utilities", () => {
  describe("formatDate", () => {
    it("formats a date-only value without a UTC timezone shift", () => {
      const formatted = formatDate("2026-11-20");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("Nov");
      expect(formatted).toContain("20");
    });

    it("handles missing, invalid, and impossible date values", () => {
      expect(formatDate(null)).toBe("Date not specified");
      expect(formatDate("")).toBe("Date not specified");
      expect(formatDate("unparseable-date")).toBe("unparseable-date");
      expect(formatDate("2026-02-31")).toBe("2026-02-31");
      expect(formatDate("2026-02-31T12:00:00Z")).toBe(
        "2026-02-31T12:00:00Z"
      );
    });
  });

  describe("getCountdownDetails", () => {
    const referenceDate = new Date(2026, 10, 15, 12);

    it("marks the current date as critical", () => {
      expect(getCountdownDetails("2026-11-15", referenceDate)).toEqual({
        daysRemaining: 0,
        label: "Due today",
        urgency: "critical",
        isOverdue: false,
      });
    });

    it("marks a deadline tomorrow as urgent", () => {
      expect(getCountdownDetails("2026-11-16", referenceDate)).toEqual({
        daysRemaining: 1,
        label: "Due tomorrow (1 day left)",
        urgency: "urgent",
        isOverdue: false,
      });
    });

    it("marks deadlines within three days as urgent", () => {
      const result = getCountdownDetails("2026-11-18", referenceDate);
      expect(result.daysRemaining).toBe(3);
      expect(result.label).toBe("3 days left");
      expect(result.urgency).toBe("urgent");
      expect(result.isOverdue).toBe(false);
    });

    it("marks a seven-day deadline as a warning", () => {
      const result = getCountdownDetails("2026-11-22", referenceDate);
      expect(result.daysRemaining).toBe(7);
      expect(result.label).toBe("7 days left");
      expect(result.urgency).toBe("warning");
      expect(result.isOverdue).toBe(false);
    });

    it("marks more distant deadlines as normal", () => {
      const result = getCountdownDetails(
        "2026-11-30",
        new Date(2026, 10, 10, 12)
      );
      expect(result.daysRemaining).toBe(20);
      expect(result.label).toBe("20 days left");
      expect(result.urgency).toBe("normal");
      expect(result.isOverdue).toBe(false);
    });

    it("identifies overdue deadlines and day counts", () => {
      expect(getCountdownDetails("2026-11-14", referenceDate)).toEqual({
        daysRemaining: -1,
        label: "Overdue by 1 day",
        urgency: "overdue",
        isOverdue: true,
      });
      expect(getCountdownDetails("2026-11-10", referenceDate)).toEqual({
        daysRemaining: -5,
        label: "Overdue by 5 days",
        urgency: "overdue",
        isOverdue: true,
      });
    });

    it("rejects empty, relative, and impossible dates", () => {
      expect(getCountdownDetails(null, referenceDate)).toBeNull();
      expect(getCountdownDetails("", referenceDate)).toBeNull();
      expect(getCountdownDetails("within 10 days", referenceDate)).toBeNull();
      expect(getCountdownDetails("invalid", referenceDate)).toBeNull();
      expect(getCountdownDetails("2026-02-31", referenceDate)).toBeNull();
      expect(
        getCountdownDetails("2026-02-31T12:00:00Z", referenceDate)
      ).toBeNull();
    });
  });
});
