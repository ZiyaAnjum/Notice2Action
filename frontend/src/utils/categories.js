/**
 * Category labels and metadata for official institutional notices.
 * Aligned with Phase 7a canonical categories from schemas/notice_output.schema.json.
 */

export const CATEGORY_LABELS = {
  scholarship_or_college: "Scholarship & Education",
  bank: "Bank & Financial",
  utility: "Utility Services",
  tax_or_payment: "Tax & Payment",
  government_scheme: "Government Scheme",
  other_out_of_scope: "General Communications (Out of Scope)",
  // Aliases for backward compatibility
  scholarship: "Scholarship & Education",
  tax_revenue: "Tax & Payment",
  utility_services: "Utility Services",
  banking_finance: "Bank & Financial",
  government_benefits: "Government Scheme",
};

export const SUPPORTED_CATEGORIES = [
  {
    key: "scholarship_or_college",
    label: "Scholarship & Education",
    description:
      "Scholarship deadlines, college fee notices, admission documents, and hostel requirements.",
  },
  {
    key: "bank",
    label: "Bank & Financial",
    description:
      "Account KYC refresh notices, dormancy warnings, and re-KYC mandates.",
  },
  {
    key: "utility",
    label: "Utility Services",
    description:
      "Electricity, water, gas, and telecom disconnection warnings or bill due dates.",
  },
  {
    key: "tax_or_payment",
    label: "Tax & Payment",
    description:
      "Property tax, municipal tax, self-assessment notices, and penalty warnings.",
  },
  {
    key: "government_scheme",
    label: "Government Scheme",
    description:
      "Welfare scheme enrollment, benefit renewal deadlines, and eligibility documents.",
  },
];

export const OUT_OF_SCOPE_CATEGORY = {
  key: "other_out_of_scope",
  label: "General Communications (Out of Scope)",
  description:
    "Personal letters, promotional flyers, receipts, recipes, and ungrounded documents.",
};

/**
 * Returns a human-friendly category label.
 * @param {string|null} category
 * @returns {string}
 */
export function getCategoryLabel(category) {
  if (!category) return "Official Notice";
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];

  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Checks whether a given category string is one of the supported 5 categories.
 * @param {string} category
 * @returns {boolean}
 */
export function isSupportedCategory(category) {
  return SUPPORTED_CATEGORIES.some((c) => c.key === category);
}
