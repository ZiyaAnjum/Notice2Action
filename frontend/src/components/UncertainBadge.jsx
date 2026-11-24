import { AlertTriangle } from "lucide-react";

/**
 * High-visibility badge for uncertain or unverified claims.
 * Complies with accessibility requirement: status is never conveyed by colour alone.
 */
export function UncertainBadge({
  text = "Please verify",
  tooltip = "We could not match this exactly to your notice. Please check the original.",
  className = "",
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-300 shadow-xs ${className}`}
      role="status"
      aria-label={`Verification needed: ${tooltip}`}
      title={tooltip}
    >
      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
