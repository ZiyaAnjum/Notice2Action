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
      className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6"
      aria-labelledby="action-plan-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
            <ListOrdered className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 block">
              Step-by-Step Guide
            </span>
            <h2 id="action-plan-heading" className="text-xl font-extrabold text-slate-950 tracking-tight">
              Action Plan
            </h2>
          </div>
        </div>
        <span className="text-xs font-bold bg-slate-100 text-slate-800 px-3 py-1 rounded-full">
          {steps.length} {steps.length === 1 ? "Step" : "Steps"}
        </span>
      </div>

      {/* Official Submission Location / Channel */}
      {channelText && (
        <div className="p-4 bg-indigo-50/70 border-2 border-indigo-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm uppercase tracking-wide">
              <MapPin className="w-4 h-4 text-indigo-700" aria-hidden="true" />
              <span>Where to Submit / Contact</span>
            </div>
            {channelUncertain && <UncertainBadge />}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-base font-bold text-slate-900">{channelText}</p>
            {onShowSource && channelPage && (
              <button
                type="button"
                onClick={() => onShowSource(channelPage, channelQuote)}
                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[36px] self-start sm:self-auto"
              >
                Show Source
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ordered Steps List */}
      {steps.length === 0 ? (
        <p className="text-slate-600 text-sm font-medium">
          No specific action steps were listed in this notice.
        </p>
      ) : (
        <ol className="space-y-4 list-none m-0 p-0">
          {steps.map((step, idx) => {
            const stepNumber = step.step_number || step.order || idx + 1;
            const stepText = step.instruction || step.description || step.text || "";
            const page = step.source_page || step.evidence?.page;
            const quote = step.evidence_quote || step.evidence?.quote;
            const isUncertain = step.status === "uncertain" || step.needs_verification;

            return (
              <li
                key={idx}
                className="p-4 sm:p-5 rounded-xl bg-slate-50 border-2 border-slate-200 hover:border-slate-300 transition-colors flex flex-col sm:flex-row items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3.5 flex-1">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white font-extrabold text-sm flex-shrink-0 mt-0.5">
                    {stepNumber}
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <p className="text-base font-bold text-slate-900 leading-relaxed">
                      {stepText}
                    </p>
                    {isUncertain && <UncertainBadge />}
                  </div>
                </div>

                {onShowSource && page && (
                  <button
                    type="button"
                    onClick={() => onShowSource(page, quote)}
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px] self-end sm:self-auto sm:ml-2"
                  >
                    Show Source
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
