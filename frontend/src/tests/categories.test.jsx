import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABELS,
  SUPPORTED_CATEGORIES,
  OUT_OF_SCOPE_CATEGORY,
  isSupportedCategory,
  getCategoryLabel,
} from "../utils/categories";

describe("categories utility", () => {
  it("defines all five canonical categories in SUPPORTED_CATEGORIES", () => {
    expect(SUPPORTED_CATEGORIES).toHaveLength(5);
    const keys = SUPPORTED_CATEGORIES.map((c) => c.key);
    expect(keys).toEqual([
      "scholarship_or_college",
      "bank",
      "utility",
      "tax_or_payment",
      "government_scheme",
    ]);

    SUPPORTED_CATEGORIES.forEach((cat) => {
      expect(cat).toHaveProperty("key");
      expect(cat).toHaveProperty("label");
      expect(cat).toHaveProperty("description");
      expect(cat.label.trim().length).toBeGreaterThan(0);
      expect(cat.description.trim().length).toBeGreaterThan(0);
    });
  });

  it("returns human-friendly labels for the five canonical categories", () => {
    expect(getCategoryLabel("scholarship_or_college")).toBe("Scholarship & Education");
    expect(getCategoryLabel("bank")).toBe("Banking & KYC");
    expect(getCategoryLabel("utility")).toBe("Utilities & Services");
    expect(getCategoryLabel("tax_or_payment")).toBe("Tax & Payment");
    expect(getCategoryLabel("government_scheme")).toBe("Government Schemes");
  });

  it("handles other_out_of_scope appropriately", () => {
    expect(CATEGORY_LABELS.other_out_of_scope).toBe("Unsupported Notice");
    expect(getCategoryLabel("other_out_of_scope")).toBe("Unsupported Notice");
    expect(OUT_OF_SCOPE_CATEGORY.key).toBe("other_out_of_scope");
    expect(OUT_OF_SCOPE_CATEGORY.label).toBe("Unsupported Notice");
    expect(OUT_OF_SCOPE_CATEGORY.description).toContain("outside the 5 supported categories");
  });

  it("verifies isSupportedCategory correctly", () => {
    expect(isSupportedCategory("scholarship_or_college")).toBe(true);
    expect(isSupportedCategory("bank")).toBe(true);
    expect(isSupportedCategory("utility")).toBe(true);
    expect(isSupportedCategory("tax_or_payment")).toBe(true);
    expect(isSupportedCategory("government_scheme")).toBe(true);

    expect(isSupportedCategory("other_out_of_scope")).toBe(false);
    expect(isSupportedCategory("unsupported")).toBe(false);
    expect(isSupportedCategory(null)).toBe(false);
    expect(isSupportedCategory(undefined)).toBe(false);
    expect(isSupportedCategory("")).toBe(false);
    expect(isSupportedCategory("random_category")).toBe(false);
  });

  it("returns General Notice when category is falsy", () => {
    expect(getCategoryLabel(null)).toBe("General Notice");
    expect(getCategoryLabel("")).toBe("General Notice");
    expect(getCategoryLabel(undefined)).toBe("General Notice");
  });

  it("handles legacy aliases and unmapped category fallbacks cleanly", () => {
    expect(getCategoryLabel("tax")).toBe("Tax & Payment");
    expect(getCategoryLabel("tax_revenue")).toBe("Tax & Payment");
    expect(getCategoryLabel("scholarship")).toBe("Scholarship & Education");
    expect(getCategoryLabel("govt_scheme")).toBe("Government Schemes");
    expect(getCategoryLabel("custom_unmapped_notice")).toBe("Custom Unmapped Notice");
  });
});
