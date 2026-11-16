import { Calendar, Bell, AlertTriangle, HelpCircle } from "lucide-react";
import { UncertainBadge } from "./UncertainBadge";
import { formatDate, getCountdownDetails } from "../utils/text";
import { AddToCalendarButton } from "./AddToCalendarButton";

  export function DeadlineCard({
    deadlines = [],
    onRemind,
    onShowSource,
    noticeTitle = "Official Notice",
    noticeId,
  }) {
    if (!deadlines || deadlines.length === 0) {
      return (
        <section
          className="bg-white border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-card space-y-2"
          aria-labelledby="deadlines-heading"
        >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-stone-100 text-stone-500">
                  <Calendar className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2 id="deadlines-heading" className="text-xl font-black text-stone-900 tracking-tight">
                  Important Deadlines
                </h2>
              </div>
                <p className="text-sm text-stone-600 font-medium">
                  No deadline was found in this notice.
                </p>
                <p className="text-xs text-stone-400">
                  This document does not specify a calendar cutoff. We recommend preparing and submitting required paperwork promptly to avoid administrative delays.
                </p>
              </section>
              );
  }

              return (
              <section
                className="bg-white border-2 border-teal-600/80 rounded-3xl p-6 sm:p-8 shadow-card space-y-6"
                aria-labelledby="deadlines-heading"
              >
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-stone-100 pb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
                          <Calendar className="w-6 h-6" aria-hidden="true" />
                        </div>
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 block">
                              Urgent Attention Required
                            </span>
                              <h2 id="deadlines-heading" className="text-2xl font-black text-stone-950 tracking-tight">
                                Notice Deadlines
                              </h2>
                            </div>
                        </div>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-teal-50 text-teal-800 border border-teal-200/80">
                            {deadlines.length} {deadlines.length === 1 ? "Deadline" : "Deadlines"} Found
                          </span>
                      </div>

                      <div className="space-y-4">
                        {deadlines.map((dl, idx) => {
                          const description = dl.description || dl.label || "Action Deadline";
                          const wording = dl.original_wording || dl.original_text || dl.wording || "";
                          const dateStr = dl.iso_date || dl.date;
                          const role = dl.role;
                          const isConflicting =
                            dl.status === "conflicting" ||
                            (dl.ambiguity_reason &&
                              (dl.ambiguity_reason.toLowerCase().includes("two different dates") ||
                                dl.ambiguity_reason.toLowerCase().includes("which one applies")));
                          const isAmbiguous =
                            !isConflicting && (dl.is_ambiguous || dl.ambiguous || Boolean(dl.ambiguity_reason));
                          const ambiguityReason = dl.ambiguity_reason;
                          const isUncertain = dl.status === "uncertain" || dl.needs_verification;
                          const isExtended = role === "extended";
                          const isPrimary =
                            role === "primary" || (!role && idx === 0 && !isConflicting && !isAmbiguous);
                          const page = dl.source_page || dl.evidence?.page;
                          const quote = dl.evidence_quote || dl.evidence?.quote;
                          const countdown =
                            dateStr && !isConflicting && !isAmbiguous && !isUncertain
                              ? getCountdownDetails(dateStr)
                              : null;

                          return (
                            <div
                              key={idx}
                              className={`rounded-2xl p-5 sm:p-6 border-2 transition-all ${isConflicting || isAmbiguous
                                    ? "bg-amber-50/70 border-amber-300"
                                    : isPrimary
                                        ? "bg-stone-50/70 border-teal-500 shadow-xs"
                                        : isExtended
                                            ? "bg-stone-50/70 border-purple-200"
                                            : "bg-stone-50/70 border-stone-200"
              }`}
                            >
                                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div className="space-y-2 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        {isConflicting && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide bg-amber-100 text-amber-950 border border-amber-300">
                                              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                                              Check which date applies
                                            </span>
                    )}
                                            {isAmbiguous && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide bg-amber-100 text-amber-950 border border-amber-300">
                                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                                                  Ambiguous Deadline
                                                </span>
                    )}
                                                {!isConflicting && !isAmbiguous && isPrimary && (
                                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide bg-teal-600 text-white">
                                                      Primary Deadline
                                                    </span>
                    )}
                                                    {!isConflicting && !isAmbiguous && isExtended && (
                                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide bg-purple-100 text-purple-900 border border-purple-200">
                                                          Later date with fee
                                                        </span>
                    )}
                                                        {!isConflicting && !isAmbiguous && role === "consequence" && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide bg-stone-200 text-stone-800 border border-stone-300">
                        Consequence
                      </span>
                    )}
                    {countdown && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-teal-50 text-teal-800 border border-teal-200/80">
                        {countdown.label}
                      </span>
                    )}
                    {isUncertain && (
                      <div className="flex flex-wrap items-center gap-2">
                        <UncertainBadge />
                        <span className="text-xs text-amber-900 font-medium">
                          We could not match this exactly to your notice. Please check the original.
                        </span>
                      </div>
                    )}
                  </div>

                  <h3 className="text-lg sm:text-xl font-black text-stone-900 leading-snug">
                    {description}
                  </h3>

                  {/* Formatted Date Callout */}
                  <div className="text-2xl sm:text-3xl font-black text-teal-900 tracking-tight pt-1">
                    {dateStr ? formatDate(dateStr) : wording || "Date not specified"}
                  </div>

                  {/* Original wording */}
                  {wording && (
                    <p className="text-xs sm:text-sm text-stone-700 font-medium">
                      Exact notice wording:{" "}
                      <span className="italic font-bold text-stone-900">
                        &ldquo;{wording}&rdquo;
                      </span>
                    </p>
                  )}

                  {/* Ambiguity or Conflict Reason */}
                  {(isConflicting || isAmbiguous) && ambiguityReason && (
                    <div className="mt-2 p-3 bg-amber-100/80 border border-amber-300 rounded-xl text-xs sm:text-sm text-amber-950 flex items-start gap-2">
                      <HelpCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">
                          {isConflicting ? "Action needed: " : "Why this date is unclear: "}
                        </span>
                        <span>{ambiguityReason}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap sm:flex-col gap-2.5 self-start sm:self-auto sm:min-w-[150px]">
                  <AddToCalendarButton
                    title={noticeTitle ? `${noticeTitle} - ${description}` : description}
                    description={wording ? `Notice wording: "${wording}"` : description}
                    dateStr={dateStr}
                    noticeId={noticeId}
                  />

                  {onRemind && (
                    <button
                      type="button"
                      onClick={() => onRemind(dl)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 shadow-xs min-h-[40px] flex-1 sm:flex-initial"
                    >
                      <Bell className="w-4 h-4" aria-hidden="true" />
                      <span>Remind Me</span>
                    </button>
                  )}

                  {onShowSource && page && (
                    <button
                      type="button"
                      onClick={() => onShowSource(page, quote)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 hover:text-stone-950 focus:outline-hidden focus:ring-2 focus:ring-teal-600 min-h-[40px] flex-1 sm:flex-initial"
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
