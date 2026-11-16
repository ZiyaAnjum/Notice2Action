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
          className="bg-white border border-coral-200/90 rounded-3xl p-6 sm:p-8 shadow-card space-y-4"
          aria-labelledby="penalties-heading"
        >
              <div className="flex items-center gap-2.5 border-b border-coral-100 pb-3">
                <div className="p-2 bg-coral-100 text-coral-800 rounded-xl">
                  <ShieldAlert className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-coral-700 block">
                      Consequences of Missing Deadlines
                    </span>
                      <h2 id="penalties-heading" className="text-xl font-black text-stone-950 tracking-tight">
                        Penalties, Fines &amp; Legal Consequences
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
                        className="p-4 rounded-2xl bg-coral-50/70 border border-coral-200/80 space-y-1.5"
                      >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-black text-coral-950">{consequence}</span>
                              {isUncertain && <UncertainBadge />}
                            </div>

                    {onShowSource && page && (
                              <button
                                type="button"
                                onClick={() => onShowSource(page, quote)}
                                className="text-xs font-bold text-coral-700 hover:text-coral-900 underline self-start sm:self-auto"
                              >
                                Source
                              </button>
                            )}
                          </div>

                  {description && (
                            <p className="text-xs sm:text-sm text-stone-700 font-medium leading-relaxed">
                              {description}
                            </p>
                          )}
                        </div>
                        );
            })}
                      </div>
        </section>
      )}

                {/* Warnings & Quality Issues Section */}
                {hasWarnings && (
                  <section
                    className="bg-white border border-amber-300 rounded-3xl p-6 sm:p-8 shadow-card space-y-4"
                    aria-labelledby="warnings-heading"
                  >
                        <div className="flex items-center gap-2.5 border-b border-amber-100 pb-3">
                          <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                          </div>
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block">
                              Quality &amp; Processing Notices
                            </span>
                              <h2 id="warnings-heading" className="text-xl font-black text-stone-950 tracking-tight">
                                Important Processing Notes
                              </h2>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {documentQuality && documentQuality !== "good" && (
                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                              <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                                Document Quality Flag: {documentQuality}
                              </span>
                              <p className="text-xs sm:text-sm text-stone-700 font-medium">
                                The original scan had low contrast or imperfect optical resolution. Please verify extracted names, amounts, and dates directly against the original PDF.
                              </p>
                            </div>
                          )}

                                {
                                  warnings &&
                                  warnings.map((warn, idx) => {
                                    const message =
                                      typeof warn === "string"
                                        ? warn
                    : warn.warning_text || warn.message || warn.warning || warn.text || "";
                              const code = typeof warn === "object" ? warn.code : null;

                              return (
                              <div
                                key={idx}
                                className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs sm:text-sm text-stone-800 flex items-start gap-2"
                              >
                    {code && (
                                  <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded flex-shrink-0">
                                    [{code}]
                                  </span>
                                )}
                                <span className="font-medium">{message}</span>
                              </div>
                              );
              })}
                        </div>
                      </section>
      )}
                    </div>
                    );
}
