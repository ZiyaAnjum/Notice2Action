import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABELS,
  SUPPORTED_CATEGORIES,
  OUT_OF_SCOPE_CATEGORY,
  isSupportedCategory,
  getCategoryLabel,
} from "../utils/categories";

describe("categories utility", () => {
  it("defines the five canonical categories with usable metadata", () => {
    expect(SUPPORTED_CATEGORIES.map((category) => category.key)).toEqual([
      "scholarship_or_college",
      "bank",
      "utility",
      "tax_or_payment",
      "government_scheme",
    ]);

    SUPPORTED_CATEGORIES.forEach((category) => {
      expect(category.key).toBeTruthy();
      expect(category.label.trim().length).toBeGreaterThan(0);
      expect(category.description.trim().length).toBeGreaterThan(0);
    });
  });

  it("returns general-purpose labels for categories currently recognised by the processor", () => {
    expect(getCategoryLabel("scholarship_or_college")).toBe("Education & student funding");
    expect(getCategoryLabel("bank")).toBe("Banking & financial services");
    expect(getCategoryLabel("utility")).toBe("Utilities & services");
    expect(getCategoryLabel("tax_or_payment")).toBe("Tax & payments");
    expect(getCategoryLabel("government_scheme")).toBe("Government & public services");
  });

  it("maps legacy aliases to the current canonical labels", () => {
    expect(getCategoryLabel("scholarship")).toBe("Education & student funding");
    expect(getCategoryLabel("tax")).toBe("Tax & payments");
    expect(getCategoryLabel("tax_revenue")).toBe("Tax & payments");
    expect(getCategoryLabel("govt_scheme")).toBe("Government & public services");
    expect(getCategoryLabel("government_benefits")).toBe("Government & public services");
    expect(getCategoryLabel("utility_services")).toBe("Utilities & services");
    expect(getCategoryLabel("banking_finance")).toBe("Banking & financial services");
  });

  it("handles out-of-scope labels and descriptions", () => {
    expect(CATEGORY_LABELS.other_out_of_scope).toBe("Other / unclassified");
    expect(getCategoryLabel("other_out_of_scope")).toBe(
      "Other / unclassified"
    );
    expect(OUT_OF_SCOPE_CATEGORY.key).toBe("other_out_of_scope");
    expect(OUT_OF_SCOPE_CATEGORY.label).toBe("Other / unclassified");
    expect(OUT_OF_SCOPE_CATEGORY.description).toContain("current processing integration");
    expect(getCategoryLabel("out_of_scope")).toBe("Other / unclassified");
    expect(getCategoryLabel("unsupported")).toBe("Other / unclassified");
  });

  it("only identifies canonical supported categories as supported", () => {
    SUPPORTED_CATEGORIES.forEach(({ key }) => {
      expect(isSupportedCategory(key)).toBe(true);
    });
    for (const category of [
      "other_out_of_scope",
      "unsupported",
      null,
      undefined,
      "",
      "random_category",
    ]) {
      expect(isSupportedCategory(category)).toBe(false);
    }
  });

  it("provides safe labels for missing or unrecognized categories", () => {
    expect(getCategoryLabel(null)).toBe("Official Notice");
    expect(getCategoryLabel(undefined)).toBe("Official Notice");
    expect(getCategoryLabel("")).toBe("Official Notice");
    expect(getCategoryLabel("custom_unmapped_notice")).toBe(
      "Custom Unmapped Notice"
    );
  });
});
