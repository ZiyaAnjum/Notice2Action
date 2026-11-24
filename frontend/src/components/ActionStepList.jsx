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
      className="surface-card p-6 sm:p-8 space-y-5"
      aria-labelledby="action-plan-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
            <ListOrdered className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
              Step-by-Step Guide
            </span>
            <h2 id="action-plan-heading" className="text-lg sm:text-xl font-extrabold text-navy-950 tracking-tight">
              Action Plan
            </h2>
          </div>
        </div>
        <span className="text-xs font-bold bg-purple-50 text-purple-800 px-3 py-1 rounded-full border border-purple-200">
          {steps.length} {steps.length === 1 ? "Step" : "Steps"}
        </span>
      </div>

      {/* Official Submission Location / Channel */}
      {channelText && (
        <div className="p-4 bg-gradient-to-r from-purple-50/70 to-cyan-50/50 border border-purple-200 rounded-2xl space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-purple-950 font-bold text-xs uppercase tracking-wider">
              <MapPin className="w-4 h-4 text-purple-600" aria-hidden="true" />
              <span>Where to Submit / Contact</span>
            </div>
            {channelUncertain && <UncertainBadge />}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-extrabold text-navy-950">{channelText}</p>
            {onShowSource && channelPage && (
              <button
                type="button"
                onClick={() => onShowSource(channelPage, channelQuote)}
                className="focus-ring inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-purple-200 text-purple-800 hover:bg-purple-50 min-h-[34px] self-start sm:self-auto shadow-xs transition"
              >
                Show Source
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ordered Steps List */}
      {steps.length === 0 ? (
        <p className="text-slate-500 text-xs sm:text-sm font-medium">
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
                className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200 hover:border-purple-300 hover:bg-white transition flex flex-col sm:flex-row items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 flex-1">
                  <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-purple-700 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                    {stepNumber}
                  </span>
                  <div className="space-y-1 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-navy-950 leading-relaxed">
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
                    className="focus-ring text-xs font-bold text-purple-700 hover:text-purple-900 underline self-start sm:self-center shrink-0"
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
