/**
 * Category labels and metadata for official notices.
 */

export const CATEGORY_LABELS = {
  tax_revenue: "Tax & Revenue",
  court_legal: "Court & Legal",
  health_medical: "Health & Medical",
  housing_tenancy: "Housing & Tenancy",
  government_benefits: "Government Benefits",
  utility_services: "Utilities & Services",
  // Common supplementary categories
  scholarship_or_college: "Scholarship & Education",
  banking_finance: "Banking & Finance",
};

export const SUPPORTED_CATEGORIES = [
  { key: "tax_revenue", label: "Tax & Revenue", description: "Tax assessments, refunds, and filing demands" },
  { key: "court_legal", label: "Court & Legal", description: "Summons, hearing dates, and legal notices" },
  { key: "health_medical", label: "Health & Medical", description: "Medical appointments, coverage, and health bills" },
  { key: "housing_tenancy", label: "Housing & Tenancy", description: "Rent notices, leases, and tenancy updates" },
  { key: "government_benefits", label: "Government Benefits", description: "Pension, welfare, social security, and grants" },
  { key: "utility_services", label: "Utilities & Services", description: "Electricity, water, gas, and telecoms bills" },
];

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
