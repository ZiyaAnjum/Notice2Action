import { Calendar, Bell, AlertTriangle, HelpCircle } from "lucide-react";
import { UncertainBadge } from "./UncertainBadge";
import { formatDate } from "../utils/text";

export function DeadlineCard({ deadlines = [], onRemind, onShowSource }) {
  if (!deadlines || deadlines.length === 0) {
    return (
      <section
        className="bg-white border-2 border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm"
        aria-labelledby="deadlines-heading"
      >
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-slate-500" aria-hidden="true" />
          <h2 id="deadlines-heading" className="text-xl font-extrabold text-slate-900 tracking-tight">
            Important Deadlines
          </h2>
        </div>
        <p className="text-base text-slate-600 font-medium">
          No deadline was found in this notice.
        </p>
      </section>
    );
  }

  return (
    <section
      className="bg-white border-2 border-indigo-600 rounded-2xl p-6 sm:p-8 shadow-md space-y-6"
      aria-labelledby="deadlines-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-indigo-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
            <Calendar className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 block">
              Urgent Attention Required
            </span>
            <h2 id="deadlines-heading" className="text-2xl font-extrabold text-slate-950 tracking-tight">
              Notice Deadlines
            </h2>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900">
          {deadlines.length} {deadlines.length === 1 ? "Deadline" : "Deadlines"} Found
        </span>
      </div>

      <div className="space-y-4">
        {deadlines.map((dl, idx) => {
          const description = dl.description || dl.label || "Action Deadline";
          const wording = dl.original_wording || dl.original_text || dl.wording || "";
          const dateStr = dl.iso_date || dl.date;
          const isAmbiguous = dl.is_ambiguous || dl.ambiguous || Boolean(dl.ambiguity_reason);
          const ambiguityReason = dl.ambiguity_reason;
          const isUncertain = dl.status === "uncertain" || dl.needs_verification;
          const page = dl.source_page || dl.evidence?.page;
          const quote = dl.evidence_quote || dl.evidence?.quote;

          return (
            <div
              key={idx}
              className={`rounded-2xl p-5 sm:p-6 border-2 transition-all ${
                isAmbiguous
                  ? "bg-amber-50/70 border-amber-400"
                  : idx === 0
                  ? "bg-slate-50 border-indigo-500 shadow-xs"
                  : "bg-slate-50 border-slate-300"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {idx === 0 && !isAmbiguous && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide bg-indigo-600 text-white">
                        Primary Deadline
                      </span>
                    )}
                    {isAmbiguous && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide bg-amber-200 text-amber-950 border border-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                        Ambiguous Deadline
                      </span>
                    )}
                    {isUncertain && <UncertainBadge />}
                  </div>

                  <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
                    {description}
                  </h3>

                  {/* Formatted Date Callout */}
                  <div className="text-2xl sm:text-3xl font-black text-indigo-900 tracking-tight pt-1">
                    {dateStr ? formatDate(dateStr) : wording || "Date not specified"}
                  </div>

                  {/* Original wording */}
                  {wording && (
                    <p className="text-sm text-slate-700 font-medium">
                      Exact notice wording:{" "}
                      <span className="italic font-semibold text-slate-900">
                        &ldquo;{wording}&rdquo;
                      </span>
                    </p>
                  )}

                  {/* Ambiguity Reason */}
                  {isAmbiguous && ambiguityReason && (
                    <div className="mt-2 p-3 bg-amber-100/80 border border-amber-300 rounded-xl text-xs sm:text-sm text-amber-950 flex items-start gap-2">
                      <HelpCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Why this date is unclear: </span>
                        <span>{ambiguityReason}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap sm:flex-col gap-2.5 self-start sm:self-auto sm:min-w-[140px]">
                  {onRemind && (
                    <button
                      type="button"
                      onClick={() => onRemind(dl)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-600 shadow-xs min-h-[44px] flex-1 sm:flex-initial"
                    >
                      <Bell className="w-4 h-4" aria-hidden="true" />
                      <span>Remind Me</span>
                    </button>
                  )}

                  {onShowSource && page && (
                    <button
                      type="button"
                      onClick={() => onShowSource(page, quote)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px] flex-1 sm:flex-initial"
                    >
                      <span>Show Source</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
