import { describe, it, expect } from "vitest";
import {
  SUPPORTED_CATEGORIES,
  OUT_OF_SCOPE_CATEGORY,
  getCategoryLabel,
  isSupportedCategory,
} from "../utils/categories";

describe("categories utility", () => {
  it("defines the canonical 5 supported categories plus out_of_scope", () => {
    expect(SUPPORTED_CATEGORIES).toHaveLength(5);
    const keys = SUPPORTED_CATEGORIES.map((c) => c.key);
    expect(keys).toContain("scholarship_or_college");
    expect(keys).toContain("bank");
    expect(keys).toContain("utility");
    expect(keys).toContain("tax_or_payment");
    expect(keys).toContain("government_scheme");
    expect(OUT_OF_SCOPE_CATEGORY.key).toBe("other_out_of_scope");
  });

  it("returns human-readable labels for canonical categories", () => {
    expect(getCategoryLabel("scholarship_or_college")).toBe("Scholarship & Education");
    expect(getCategoryLabel("bank")).toBe("Bank & Financial");
    expect(getCategoryLabel("utility")).toBe("Utility Services");
    expect(getCategoryLabel("tax_or_payment")).toBe("Tax & Payment");
    expect(getCategoryLabel("government_scheme")).toBe("Government Scheme");
    expect(getCategoryLabel("other_out_of_scope")).toBe("General Communications (Out of Scope)");
  });

  it("returns legacy alias labels correctly", () => {
    expect(getCategoryLabel("scholarship")).toBe("Scholarship & Education");
    expect(getCategoryLabel("tax_revenue")).toBe("Tax & Payment");
  });

  it("falls back gracefully for missing or unrecognized categories", () => {
    expect(getCategoryLabel(null)).toBe("Official Notice");
    expect(getCategoryLabel("")).toBe("Official Notice");
    expect(getCategoryLabel("custom_notice")).toBe("Custom Notice");
  });

  it("correctly identifies supported vs out-of-scope categories", () => {
    expect(isSupportedCategory("bank")).toBe(true);
    expect(isSupportedCategory("utility")).toBe(true);
    expect(isSupportedCategory("tax_or_payment")).toBe(true);
    expect(isSupportedCategory("other_out_of_scope")).toBe(false);
    expect(isSupportedCategory("unknown_random")).toBe(false);
  });
});

