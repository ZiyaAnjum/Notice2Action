import { AlertTriangle } from "lucide-react";

/**
 * High-visibility badge for uncertain or unverified claims.
 * Complies with accessibility requirement: status is never conveyed by colour alone.
 */
export function UncertainBadge({ text = "Please verify", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border-2 border-amber-400 ${className}`}
      role="status"
      aria-label="Verification needed"
    >
      <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
