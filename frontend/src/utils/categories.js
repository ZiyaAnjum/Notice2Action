/**
 * Category labels and metadata recognised by the current processing integration.
 * Canonical keys remain aligned with the backend notice-output schema.
 */

export const CATEGORY_LABELS = {
  scholarship_or_college: "Education & student funding",
  bank: "Banking & financial services",
  utility: "Utilities & services",
  tax_or_payment: "Tax & payments",
  government_scheme: "Government & public services",
  other_out_of_scope: "Other / unclassified",
  scholarship: "Education & student funding",
  tax: "Tax & payments",
  tax_revenue: "Tax & payments",
  govt_scheme: "Government & public services",
  government_benefits: "Government & public services",
  utility_services: "Utilities & services",
  banking_finance: "Banking & financial services",
  out_of_scope: "Other / unclassified",
  unsupported: "Other / unclassified",
};

export const SUPPORTED_CATEGORIES = [
  {
    key: "scholarship_or_college",
    label: "Education & student funding",
    description:
      "Education, enrollment, student funding, and credential communications currently recognised by the processor.",
  },
  {
    key: "bank",
    label: "Banking & financial services",
    description:
      "Banking, account servicing, and payment communications currently recognised by the processor.",
  },
  {
    key: "utility",
    label: "Utilities & services",
    description:
      "Utility, telecom, and service-account communications currently recognised by the processor.",
  },
  {
    key: "tax_or_payment",
    label: "Tax & payments",
    description:
      "Tax, assessment, billing, and statutory payment communications currently recognised by the processor.",
  },
  {
    key: "government_scheme",
    label: "Government & public services",
    description:
      "Government, municipal, and public-benefit communications currently recognised by the processor.",
  },
];

export const OUT_OF_SCOPE_CATEGORY = {
  key: "other_out_of_scope",
  label: "Other / unclassified",
  description:
    "Documents not classified by the current processing integration. Classification coverage depends on the connected service; review the original document.",
};

/**
 * Returns a human-friendly category label.
 * @param {string|null|undefined} category
 * @returns {string}
 */
export function getCategoryLabel(category) {
  if (typeof category !== "string" || !category.trim()) return "Official Notice";
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];

  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Checks whether a category is recognised by the current processing integration.
 * @param {string|null|undefined} category
 * @returns {boolean}
 */
export function isSupportedCategory(category) {
  if (typeof category !== "string") return false;
  return SUPPORTED_CATEGORIES.some((item) => item.key === category);
}
