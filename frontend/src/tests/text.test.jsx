import { describe, it, expect } from "vitest";
import { formatDate, getCountdownDetails } from "../utils/text";

describe("text and date utilities", () => {
  describe("formatDate", () => {
    it("formats date-only YYYY-MM-DD correctly", () => {
      const formatted = formatDate("2026-11-20");
      expect(formatted).toContain("Nov 20, 2026");
    });

    it("handles null and empty values gracefully", () => {
      expect(formatDate(null)).toBe("Not specified");
      expect(formatDate("")).toBe("Not specified");
      expect(formatDate("unparseable-date")).toBe("unparseable-date");
      expect(formatDate("2026-02-31")).toBe("2026-02-31");
    });
  });

  describe("getCountdownDetails", () => {
    const fixedNow = new Date("2026-11-10T12:00:00Z");

    it("returns 'Due today' with critical urgency when date matches today", () => {
      const result = getCountdownDetails("2026-11-10", fixedNow);
      expect(result).not.toBeNull();
      expect(result.daysRemaining).toBe(0);
      expect(result.label).toBe("Due today");
      expect(result.urgency).toBe("critical");
      expect(result.isOverdue).toBe(false);
    });

    it("returns 'Due tomorrow (1 day left)' with critical urgency when due next day", () => {
      const result = getCountdownDetails("2026-11-11", fixedNow);
      expect(result).not.toBeNull();
      expect(result.daysRemaining).toBe(1);
      expect(result.label).toBe("Due tomorrow (1 day left)");
      expect(result.urgency).toBe("critical");
      expect(result.isOverdue).toBe(false);
    });

    it("returns '3 days left' with urgent urgency for 3-day window", () => {
      const result = getCountdownDetails("2026-11-13", fixedNow);
      expect(result).not.toBeNull();
      expect(result.daysRemaining).toBe(3);
      expect(result.label).toBe("3 days left");
      expect(result.urgency).toBe("urgent");
      expect(result.isOverdue).toBe(false);
    });

    it("returns '7 days left' with warning urgency for 7-day window", () => {
      const result = getCountdownDetails("2026-11-17", fixedNow);
      expect(result).not.toBeNull();
      expect(result.daysRemaining).toBe(7);
      expect(result.label).toBe("7 days left");
      expect(result.urgency).toBe("warning");
      expect(result.isOverdue).toBe(false);
    });

    it("returns '20 days left' with normal urgency when well in the future", () => {
      const result = getCountdownDetails("2026-11-30", fixedNow);
      expect(result).not.toBeNull();
      expect(result.daysRemaining).toBe(20);
      expect(result.label).toBe("20 days left");
      expect(result.urgency).toBe("normal");
      expect(result.isOverdue).toBe(false);
    });

    it("handles overdue dates with overdue urgency and day count", () => {
      const yesterdayResult = getCountdownDetails("2026-11-09", fixedNow);
      expect(yesterdayResult.isOverdue).toBe(true);
      expect(yesterdayResult.daysRemaining).toBe(-1);
      expect(yesterdayResult.label).toBe("Overdue by 1 day");
      expect(yesterdayResult.urgency).toBe("overdue");

      const pastResult = getCountdownDetails("2026-11-05", fixedNow);
      expect(pastResult.isOverdue).toBe(true);
      expect(pastResult.daysRemaining).toBe(-5);
      expect(pastResult.label).toBe("Overdue by 5 days");
      expect(pastResult.urgency).toBe("overdue");
    });

    it("returns null for unparseable dates or empty inputs", () => {
      expect(getCountdownDetails(null)).toBeNull();
      expect(getCountdownDetails("")).toBeNull();
      expect(getCountdownDetails("within 10 days")).toBeNull();
      expect(getCountdownDetails("invalid")).toBeNull();
      expect(getCountdownDetails("2026-02-31", fixedNow)).toBeNull();
    });
  });
});
