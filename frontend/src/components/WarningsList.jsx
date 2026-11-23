import { AlertTriangle, AlertCircle } from "lucide-react";
import { EvidenceBadge } from "./EvidenceBadge";

export function WarningsList({ warnings = [], documentQuality }) {
  const hasWarnings = warnings.length > 0 || documentQuality !== "good";

  if (!hasWarnings) {
    return null;
  }

  return (
    <div className="surface-card border-amber-300 bg-amber-50/60 p-5 sm:p-6 shadow-sm space-y-3 ui-fade-in">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm sm:text-base font-extrabold text-amber-950">
          Uncertainty Alerts &amp; Document Quality Warnings
        </h3>
      </div>
      <p className="text-xs text-amber-900 leading-relaxed font-medium">
        The following items in this notice contain ambiguities, relative timelines, or scan defects. Always cross-check the original notice before acting.
      </p>

      {documentQuality && documentQuality !== "good" && (
        <div className="p-3 rounded-xl bg-amber-100/80 border border-amber-300 text-xs text-amber-950 font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-800 shrink-0" />
          <span>Notice Scan Assessment: <span className="uppercase">{documentQuality}</span>. Some text may be degraded.</span>
        </div>
      )}

      <ul className="space-y-2">
        {warnings.map((warn, idx) => (
          <li
            key={idx}
            className="p-3 rounded-xl bg-white border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
          >
            <div>
              <span className="font-mono text-[11px] font-bold text-amber-900 mr-2 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                [{warn.code}]
              </span>
              <span className="text-navy-950 font-semibold">{warn.message}</span>
            </div>
            {warn.evidence && (
              <div className="self-end sm:self-auto shrink-0">
                <EvidenceBadge evidence={warn.evidence} status="ambiguous" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
