/**
 * Category labels and metadata for official notices.
 */

export const CATEGORY_LABELS = {
  // Core tested categories
  scholarship_or_college: "Scholarship & Education",
  bank: "Banking & Finance",
  utility: "Utilities & Services",
  tax_or_payment: "Tax & Revenue",
  government_scheme: "Government Benefits & Schemes",
  // Expanded general mode categories
  insurance_or_health: "Insurance & Health",
  legal_or_court: "Court & Legal",
  employment: "Employment & Workplace",
  other_official_notice: "Other Official Notice",
  // Out of scope
  other_out_of_scope: "Unsupported Document",
  // Legacy / scaffold keys for compatibility
  tax_revenue: "Tax & Revenue",
  court_legal: "Court & Legal",
  health_medical: "Insurance & Health",
  housing_tenancy: "Housing & Tenancy",
  government_benefits: "Government Benefits & Schemes",
  utility_services: "Utilities & Services",
  banking_finance: "Banking & Finance",
};

export const SUPPORTED_CATEGORIES = [
  {
    key: "scholarship_or_college",
    label: "Scholarship & Education",
    description: "Merit scholarships, college renewals, and fee circulars (Tested)",
  },
  {
    key: "bank",
    label: "Banking & Finance",
    description: "Account alerts, KYC renewals, and loan notifications (Tested)",
  },
  {
    key: "utility",
    label: "Utilities & Services",
    description: "Electricity, water, gas, and reconnection notices (Tested)",
  },
  {
    key: "tax_or_payment",
    label: "Tax & Revenue",
    description: "Property tax, municipal tax, and revenue demand notices (Tested)",
  },
  {
    key: "government_scheme",
    label: "Government Benefits & Schemes",
    description: "Welfare scheme eligibility and subsidy circulars (Tested)",
  },
  {
    key: "insurance_or_health",
    label: "Insurance & Health",
    description: "Health policies, insurance renewals, and claim directives (General Mode)",
  },
  {
    key: "legal_or_court",
    label: "Court & Legal",
    description: "Court summons, advocate notices, and legal compliance (General Mode)",
  },
  {
    key: "employment",
    label: "Employment & Workplace",
    description: "Employment notices and statutory workplace circulars (General Mode)",
  },
  {
    key: "other_official_notice",
    label: "Other Official Notices",
    description: "Other actionable government or institutional circulars (General Mode)",
  },
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
