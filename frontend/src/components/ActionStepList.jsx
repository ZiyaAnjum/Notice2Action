import { ListOrdered, MapPin } from "lucide-react";
import { UncertainBadge } from "./UncertainBadge";

export function ActionStepList({ steps = [], submissionChannel, onShowSource }) {
  const channelText =
    typeof submissionChannel === "string"
      ? submissionChannel
      : submissionChannel?.value || submissionChannel?.channel || "";
  const channelPage = submissionChannel?.source_page || submissionChannel?.evidence?.page;
  const channelQuote = submissionChannel?.evidence_quote || submissionChannel?.evidence?.quote;
  const channelUncertain =
    submissionChannel?.status === "uncertain" || submissionChannel?.needs_verification;

  return (
    <section
      className="bg-white border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-card space-y-6"
      aria-labelledby="action-plan-heading"
    >
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-2.5">
              <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
                <ListOrdered className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-700 block">
                    Step-by-Step Guide
                  </span>
                    <h2 id="action-plan-heading" className="text-xl font-black text-stone-950 tracking-tight">
                      Action Plan
                    </h2>
                  </div>
              </div>
                <span className="text-xs font-extrabold bg-stone-100 text-stone-800 px-3 py-1 rounded-full border border-stone-200">
                  {steps.length} {steps.length === 1 ? "Step" : "Steps"}
                </span>
            </div>

            {/* Official Submission Location / Channel */}
            {channelText && (
                <div className="p-4 bg-teal-50/80 border border-teal-200/90 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-teal-950 font-extrabold text-xs uppercase tracking-wide">
                        <MapPin className="w-4 h-4 text-teal-700" aria-hidden="true" />
                        <span>Where to Submit / Contact</span>
                      </div>
                      {channelUncertain && <UncertainBadge />}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-sm font-bold text-stone-900">{channelText}</p>
                      {onShowSource && channelPage && (
                        <button
                          type="button"
                          onClick={() => onShowSource(channelPage, channelQuote)}
                          className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-teal-300 text-teal-800 hover:bg-teal-50 focus:outline-hidden focus:ring-2 focus:ring-teal-600 min-h-[36px] self-start sm:self-auto"
                        >
                          Show Source
                        </button>
                      )}
                    </div>
                  </div>
      )}

                  {/* Ordered Steps List */}
                  {steps.length === 0 ? (
                      <p className="text-stone-500 text-xs sm:text-sm font-medium">
                        No specific action steps were listed in this notice.
                      </p>
                      ) : (
                        <ol className="space-y-3 list-none m-0 p-0">
                          {steps.map((step, idx) => {
                            const stepNumber = step.step_number || step.order || idx + 1;
                            const stepText = step.instruction || step.description || step.text || "";
                            const page = step.source_page || step.evidence?.page;
                            const quote = step.evidence_quote || step.evidence?.quote;
                            const isUncertain = step.status === "uncertain" || step.needs_verification;

                            return (
                              <li
                                key={idx}
                                className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 hover:border-teal-300 transition-colors flex flex-col sm:flex-row items-start justify-between gap-3"
                              >
                                    <div className="flex items-start gap-3 flex-1">
                                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-teal-600 text-white font-black text-xs flex-shrink-0 mt-0.5">
                                        {stepNumber}
                                      </span>
                                          <div className="space-y-1 flex-1">
                                            <p className="text-xs sm:text-sm font-bold text-stone-900 leading-relaxed">
                                              {stepText}
                                            </p>
                                            {isUncertain && (
                                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                                <UncertainBadge />
                                                  <span className="text-[11px] text-amber-900 font-medium">
                                                    We could not match this exactly to your notice. Please check the original.
                                                  </span>
                                              </div>
                                            )}
                                          </div>
                                      </div>

                                      {onShowSource && page && (
                                        <button
                                          type="button"
                                          onClick={() => onShowSource(page, quote)}
                                          className="text-xs font-bold text-teal-700 hover:text-teal-900 underline self-start sm:self-center flex-shrink-0"
                                        >
                                          Source
                                        </button>
                                      )}
                                    </li>
                                    );
          })}
                                  </ol>
      )}
                                </section>
                                );
}
