import { AlertTriangle, ShieldAlert } from "lucide-react";
import { UncertainBadge } from "./UncertainBadge";

export function PenaltiesAndWarnings({
  penalties = [],
  warnings = [],
  documentQuality,
  onShowSource,
}) {
  const hasPenalties = penalties && penalties.length > 0;
  const hasWarnings = (warnings && warnings.length > 0) || (documentQuality && documentQuality !== "good");

  if (!hasPenalties && !hasWarnings) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Penalties Section */}
      {hasPenalties && (
        <section
          className="bg-white border-2 border-rose-300 rounded-2xl p-6 sm:p-8 shadow-xs space-y-4"
          aria-labelledby="penalties-heading"
        >
          <div className="flex items-center gap-2.5 border-b border-rose-100 pb-3">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 block">
                Consequences of Missing Deadlines
              </span>
              <h2 id="penalties-heading" className="text-xl font-extrabold text-slate-950 tracking-tight">
                Penalties, Fines & Legal Consequences
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            {penalties.map((item, idx) => {
              const consequence =
                item.consequence || item.amount || item.type || item.title || "Consequence";
              const description = item.description || item.text || "";
              const isUncertain = item.status === "uncertain" || item.needs_verification;
              const page = item.source_page || item.evidence?.page;
              const quote = item.evidence_quote || item.evidence?.quote;

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-rose-50/60 border-2 border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-rose-900 uppercase tracking-wide">
                        {consequence}
                      </span>
                      {isUncertain && <UncertainBadge />}
                    </div>
                    {description && (
                      <p className="text-sm font-medium text-slate-800 leading-relaxed">
                        {description}
                      </p>
                    )}
                  </div>

                  {onShowSource && page && (
                    <button
                      type="button"
                      onClick={() => onShowSource(page, quote)}
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 focus:outline-hidden focus:ring-2 focus:ring-rose-600 min-h-[36px] self-start sm:self-auto"
                    >
                      Show Source
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Warnings & Notice Alerts */}
      {hasWarnings && (
        <section
          className="bg-amber-50/80 border-2 border-amber-400 rounded-2xl p-6 sm:p-8 shadow-xs space-y-4"
          aria-labelledby="warnings-heading"
        >
          <div className="flex items-center gap-2.5 border-b border-amber-200 pb-3">
            <div className="p-2 bg-amber-200 text-amber-900 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-800" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block">
                Cautionary Notes
              </span>
              <h2 id="warnings-heading" className="text-xl font-extrabold text-amber-950 tracking-tight">
                Important Notice Warnings & Ambiguities
              </h2>
            </div>
          </div>

          {documentQuality && documentQuality !== "good" && (
            <div className="p-3 bg-amber-100 border border-amber-300 rounded-xl text-xs sm:text-sm text-amber-900 font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>
                Document scan quality: <span className="uppercase font-bold">{documentQuality}</span>. Some text may have been degraded or faint.
              </span>
            </div>
          )}

          {warnings && warnings.length > 0 && (
            <div className="space-y-3">
              {warnings.map((warn, idx) => {
                const message = typeof warn === "string" ? warn : warn.message || warn.text || "";
                const code = typeof warn === "object" ? warn.code : null;
                const page = typeof warn === "object" ? warn.source_page || warn.evidence?.page : null;
                const quote = typeof warn === "object" ? warn.evidence_quote || warn.evidence?.quote : null;
                const isUncertain = typeof warn === "object" && (warn.status === "uncertain" || warn.needs_verification);

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-white/90 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {code && (
                          <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                            [{code}]
                          </span>
                        )}
                        {isUncertain && <UncertainBadge />}
                      </div>
                      <p className="text-sm font-medium text-amber-950 leading-relaxed">
                        {message}
                      </p>
                    </div>

                    {onShowSource && page && (
                      <button
                        type="button"
                        onClick={() => onShowSource(page, quote)}
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 focus:outline-hidden focus:ring-2 focus:ring-amber-600 min-h-[36px] self-start sm:self-auto"
                      >
                        Show Source
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
