import React from "react";
import { EvidenceBadge } from "./EvidenceBadge";

export function WarningsList({ warnings = [], documentQuality }) {
  const hasWarnings = warnings.length > 0 || documentQuality !== "good";

  if (!hasWarnings) {
    return null;
  }

  return (
    <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">⚠️</span>
        <h3 className="text-base font-bold text-amber-900">
          Uncertainty Alerts & Document Quality Warnings
        </h3>
      </div>
      <p className="text-xs text-amber-800 mb-3">
        The following items in this notice contain ambiguities, relative timelines, or scan defects. Always cross-check the original notice before acting.
      </p>

      {documentQuality && documentQuality !== "good" && (
        <div className="mb-2 p-2.5 rounded bg-amber-100/70 border border-amber-300 text-xs text-amber-900 font-semibold">
          Notice Scan Assessment: <span className="uppercase">{documentQuality}</span>. Some text may be degraded.
        </div>
      )}

      <ul className="space-y-2">
        {warnings.map((warn, idx) => (
          <li
            key={idx}
            className="p-3 rounded-lg bg-white/80 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <div>
              <span className="font-mono text-[11px] font-bold text-amber-900 mr-2 bg-amber-100 px-1.5 py-0.5 rounded">
                [{warn.code}]
              </span>
              <span className="text-xs text-amber-950 font-medium">{warn.message}</span>
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
