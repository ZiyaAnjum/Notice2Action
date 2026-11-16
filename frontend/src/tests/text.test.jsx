import { describe, it, expect } from "vitest";
import { formatDate, getCountdownDetails } from "../utils/text";

describe("text utilities", () => {
  describe("formatDate", () => {
    it("formats YYYY-MM-DD correctly without UTC shift", () => {
      const formatted = formatDate("2026-11-20");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("Nov");
      expect(formatted).toContain("20");
    });

    it("handles missing or null input gracefully", () => {
      expect(formatDate(null)).toBe("Date not specified");
      expect(formatDate("")).toBe("Date not specified");
    });
  });

  describe("getCountdownDetails", () => {
    const baseDate = new Date(2026, 10, 15); // 15 Nov 2026

    it("detects same-day deadline as critical", () => {
      const res = getCountdownDetails("2026-11-15", baseDate);
      expect(res.daysRemaining).toBe(0);
      expect(res.label).toBe("Due today");
      expect(res.urgency).toBe("critical");
    });

    it("detects tomorrow deadline as urgent", () => {
      const res = getCountdownDetails("2026-11-16", baseDate);
      expect(res.daysRemaining).toBe(1);
      expect(res.label).toBe("Due tomorrow (1 day left)");
      expect(res.urgency).toBe("urgent");
    });

    it("detects 3-day deadline as urgent", () => {
      const res = getCountdownDetails("2026-11-18", baseDate);
      expect(res.daysRemaining).toBe(3);
      expect(res.label).toBe("3 days left");
      expect(res.urgency).toBe("urgent");
    });

    it("detects 7-day deadline as warning", () => {
      const res = getCountdownDetails("2026-11-22", baseDate);
      expect(res.daysRemaining).toBe(7);
      expect(res.label).toBe("7 days left");
      expect(res.urgency).toBe("warning");
    });

    it("detects >7-day deadline as normal", () => {
      const res = getCountdownDetails("2026-11-30", baseDate);
      expect(res.daysRemaining).toBe(15);
      expect(res.label).toBe("15 days left");
      expect(res.urgency).toBe("normal");
    });

    it("detects past deadline as overdue", () => {
      const res = getCountdownDetails("2026-11-10", baseDate);
      expect(res.daysRemaining).toBe(-5);
      expect(res.label).toBe("Overdue by 5 days");
      expect(res.urgency).toBe("overdue");
    });
  });
});

