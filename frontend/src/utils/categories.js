/**
 * Category labels and metadata for official notices.
 * Aligned with the canonical schema contract (schemas/notice_output.schema.json)
 * and project requirements (PRD Section 2 and rules.md).
 */

export const CATEGORY_LABELS = {
  // Five canonical supported categories
  scholarship_or_college: "Scholarship & Education",
  bank: "Banking & KYC",
  utility: "Utilities & Services",
  tax_or_payment: "Tax & Payment",
  government_scheme: "Government Schemes",

  // Out-of-scope / unsupported handling
  other_out_of_scope: "Unsupported Notice",

  // Shorthand and legacy aliases for backward compatibility
  scholarship: "Scholarship & Education",
  tax: "Tax & Payment",
  tax_revenue: "Tax & Payment",
  govt_scheme: "Government Schemes",
  government_benefits: "Government Schemes",
  utility_services: "Utilities & Services",
  banking_finance: "Banking & KYC",
  out_of_scope: "Unsupported Notice",
  unsupported: "Unsupported Notice",
};

export const SUPPORTED_CATEGORIES = [
  {
    key: "scholarship_or_college",
    label: "Scholarship & Education",
    description: "Financial aid circulars, college renewal mandates, and stipend applications",
  },
  {
    key: "bank",
    label: "Banking & KYC",
    description: "Account KYC refresh notices, dormancy warnings, and re-KYC mandates",
  },
  {
    key: "utility",
    label: "Utilities & Services",
    description: "Electricity, water, or gas disconnection warnings and meter notices",
  },
  {
    key: "tax_or_payment",
    label: "Tax & Payment",
    description: "Municipal property tax notices, assessment demands, and advance tax alerts",
  },
  {
    key: "government_scheme",
    label: "Government Schemes",
    description: "Direct benefit transfer (DBT) registrations and subsidy windows",
  },
];

export const OUT_OF_SCOPE_CATEGORY = {
  key: "other_out_of_scope",
  label: "Unsupported Notice",
  description:
    "Documents outside the 5 supported categories (e.g. recipes, commercial invoices, lease agreements, brochures)",
};

/**
 * Checks whether a given category is one of the 5 canonical supported categories.
 * @param {string|null} category
 * @returns {boolean}
 */
export function isSupportedCategory(category) {
  if (!category) return false;
  return SUPPORTED_CATEGORIES.some((c) => c.key === category);
}

/**
 * Returns a human-friendly category label.
 * @param {string|null} category
 * @returns {string}
 */
export function getCategoryLabel(category) {
  if (!category) return "General Notice";
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];

  // Fallback: title-case snake_case string
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
