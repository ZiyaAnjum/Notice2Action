import { AlertTriangle, FileText, AlertCircle } from "lucide-react";

export function ConsequenceList({ consequences = [], onShowSource = null }) {
  const validConsequences = (consequences || []).filter(
    (c) => c && ((c.label && c.label.trim()) || (c.value && c.value.trim()))
  );

  if (validConsequences.length === 0) {
    return null;
  }

  return (
    <div className="pt-4 border-t border-slate-100 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-slate-500" aria-hidden="true" />
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
          Fees, Surcharges & Consequences if Missed
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {validConsequences.map((item, idx) => {
          const hasUncertainty = item.evidence && item.evidence.verified === false;
          const hasSource = item.evidence && (item.evidence.page || item.evidence.quote);

          return (
            <div
              key={idx}
              className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex flex-col justify-between gap-1.5"
            >
              <div>
                <p className="font-extrabold text-navy-950 text-sm">{item.label}</p>
                <p className="text-slate-700 font-semibold mt-0.5 leading-snug">{item.value}</p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 mt-1">
                {hasUncertainty ? (
                  <span
                    title="Supporting quote could not be verified verbatim in original notice text"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300"
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-800" aria-hidden="true" />
                    <span>Verify</span>
                  </span>
                ) : (
                  <span />
                )}

                {hasSource && onShowSource && (
                  <button
                    type="button"
                    onClick={() => onShowSource(item.evidence.page, item.evidence.quote)}
                    aria-label={`View source for ${item.label}`}
                    className="inline-flex items-center gap-1 font-bold text-purple-700 hover:text-purple-900 hover:underline min-h-[30px] px-1 focus:outline-hidden focus:ring-2 focus:ring-purple-600 ml-auto"
                  >
                    <FileText className="w-3 h-3" aria-hidden="true" />
                    <span>Source {item.evidence.page ? `p.${item.evidence.page}` : ""}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

