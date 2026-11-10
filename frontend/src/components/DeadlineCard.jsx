import { Calendar, Bell, AlertTriangle, HelpCircle, CalendarOff, Clock } from "lucide-react";
import { UncertainBadge } from "./UncertainBadge";
import { AddToCalendarButton } from "./AddToCalendarButton";
import { formatDate, getCountdownDetails } from "../utils/text";

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
        className="bg-white border-2 border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm space-y-3"
        aria-labelledby="deadlines-heading"
      >
        <div className="flex items-center gap-2.5 text-slate-700">
          <div className="p-2 bg-slate-100 rounded-xl text-slate-500">
            <CalendarOff className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Timeline Status
            </span>
            <h2 id="deadlines-heading" className="text-xl font-extrabold text-slate-900 tracking-tight">
              Important Deadlines
            </h2>
          </div>
        </div>
        <p className="text-base text-slate-600 font-medium">
          No deadline was found in this notice.
        </p>
        <p className="text-xs sm:text-sm text-slate-500 font-normal">
          This document does not specify a calendar cutoff. We recommend preparing and submitting required paperwork promptly to avoid administrative delays.
        </p>
      </section>
    );
  }

  // Identify primary vs subordinate deadlines
  const enrichedDeadlines = deadlines.map((dl, idx) => {
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
    const isUncertain = dl.status === "uncertain" || dl.needs_verification;
    const isExtended = role === "extended";
    const isPrimary =
      role === "primary" || (!role && idx === 0 && !isConflicting && !isAmbiguous);
    const countdown =
  dateStr && !isConflicting && !isAmbiguous && !isUncertain
    ? getCountdownDetails(dateStr)
    : null;

    return {
      ...dl,
      description,
      wording,
      dateStr,
      role,
      isConflicting,
      isAmbiguous,
      isUncertain,
      isExtended,
      isPrimary,
      countdown,
      page: dl.source_page || dl.evidence?.page,
      quote: dl.evidence_quote || dl.evidence?.quote,
    };
  });

  const primaryDeadlines = enrichedDeadlines.filter((d) => d.isPrimary);
  const secondaryDeadlines = enrichedDeadlines.filter((d) => !d.isPrimary);

  // Helper for urgency countdown badge styling
  const renderCountdownBadge = (countdown) => {
    if (!countdown) return null;
    let badgeClass = "bg-indigo-100 text-indigo-900 border border-indigo-200";
    if (countdown.urgency === "overdue") {
      badgeClass = "bg-rose-100 text-rose-950 border-2 border-rose-400 font-black";
    } else if (countdown.urgency === "critical") {
      badgeClass = "bg-rose-600 text-white font-black animate-pulse shadow-sm";
    } else if (countdown.urgency === "urgent") {
      badgeClass = "bg-amber-100 text-amber-950 border-2 border-amber-400 font-extrabold";
    } else if (countdown.urgency === "warning") {
      badgeClass = "bg-amber-50 text-amber-900 border border-amber-300 font-bold";
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs uppercase tracking-wider ${badgeClass}`}
      >
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{countdown.label}</span>
      </span>
    );
  };

  const renderDeadlineCardItem = (dl, idx, isHero = false) => {
    return (
      <div
        key={idx}
        className={`rounded-2xl p-5 sm:p-7 border-2 transition-all ${
          dl.isConflicting || dl.isAmbiguous
            ? "bg-amber-50/80 border-amber-400 shadow-sm"
            : isHero
            ? "bg-gradient-to-br from-indigo-50/90 via-white to-slate-50 border-indigo-600 shadow-md ring-2 ring-indigo-500/20"
            : dl.isExtended
            ? "bg-slate-50/90 border-purple-300 shadow-xs"
            : "bg-slate-50 border-slate-300 shadow-xs"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2">
              {dl.isConflicting && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide bg-amber-200 text-amber-950 border border-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                  Check which date applies
                </span>
              )}
              {dl.isAmbiguous && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide bg-amber-200 text-amber-950 border border-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                  Ambiguous Deadline
                </span>
              )}
              {!dl.isConflicting && !dl.isAmbiguous && dl.isPrimary && (
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-600 text-white shadow-xs">
                  Primary Deadline
                </span>
              )}
              {!dl.isConflicting && !dl.isAmbiguous && dl.isExtended && (
                <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide bg-purple-100 text-purple-900 border border-purple-300">
                  Later date with fee
                </span>
              )}
              {!dl.isConflicting && !dl.isAmbiguous && dl.role === "consequence" && (
                <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide bg-slate-200 text-slate-800 border border-slate-300">
                  Consequence
                </span>
              )}

              {/* Active countdown pill */}
              {renderCountdownBadge(dl.countdown)}

              {/* Uncertainty badge */}
              {dl.isUncertain && (
                <div className="flex flex-wrap items-center gap-2">
                  <UncertainBadge />
                  <span className="text-xs text-amber-900 font-medium">
                    We could not match this exactly to your notice. Please check the original.
                  </span>
                </div>
              )}
            </div>

            {/* Description / Label */}
            <h3 className={`font-black text-slate-900 leading-snug ${isHero ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"}`}>
              {dl.description}
            </h3>

            {/* Formatted Date Callout */}
            <div className={`font-black text-indigo-950 tracking-tight ${isHero ? "text-2xl sm:text-4xl text-indigo-900" : "text-xl sm:text-2xl"}`}>
              {dl.dateStr ? formatDate(dl.dateStr) : dl.wording || "Date not specified"}
            </div>

            {/* Original wording */}
            {dl.wording && (
              <p className="text-sm text-slate-700 font-medium pt-1">
                Exact notice wording:{" "}
                <span className="italic font-semibold text-slate-900">
                  &ldquo;{dl.wording}&rdquo;
                </span>
              </p>
            )}

            {/* Ambiguity or Conflict Reason */}
            {(dl.isConflicting || dl.isAmbiguous) && dl.ambiguity_reason && (
              <div className="mt-3 p-3.5 bg-amber-100/90 border border-amber-300 rounded-xl text-xs sm:text-sm text-amber-950 flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-extrabold">
                    {dl.isConflicting ? "Action needed: " : "Why this date is unclear: "}
                  </span>
                  <span>{dl.ambiguity_reason}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 pt-2 lg:pt-0 self-stretch sm:self-auto lg:min-w-[170px]">
            {/* Add to Calendar button */}
            {dl.dateStr && !dl.isConflicting && !dl.isAmbiguous && !dl.isUncertain && (
              <AddToCalendarButton
                title={`${noticeTitle} - ${dl.description}`}
                description={`Official deadline: ${dl.wording || dl.description}`}
                dateStr={dl.dateStr}
                noticeId={noticeId}
              />
            )}

            {/* Remind Me button */}
            {onRemind && (
              <button
                type="button"
                onClick={() => onRemind(dl)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px] transition-colors"
              >
                <Bell className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span>Remind Me</span>
              </button>
            )}

            {/* Show Source button */}
            {onShowSource && dl.page && (
              <button
                type="button"
                onClick={() => onShowSource(dl.page, dl.quote)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px] transition-colors"
              >
                <span>Show Source</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      className="bg-white border-2 border-indigo-600 rounded-3xl p-6 sm:p-8 shadow-md space-y-6"
      aria-labelledby="deadlines-heading"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-indigo-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl shadow-xs">
            <Calendar className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-indigo-700 block">
              Urgent Attention Required
            </span>
            <h2 id="deadlines-heading" className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
              Notice Deadlines
            </h2>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
          {deadlines.length} {deadlines.length === 1 ? "Deadline" : "Deadlines"} Found
        </span>
      </div>

      {/* Primary Deadlines (Hero) */}
      {primaryDeadlines.length > 0 && (
        <div className="space-y-4">
          {primaryDeadlines.map((dl, idx) => renderDeadlineCardItem(dl, idx, true))}
        </div>
      )}

      {/* Secondary & Extended Deadlines */}
      {secondaryDeadlines.length > 0 && (
        <div className="space-y-3 pt-2">
          {primaryDeadlines.length > 0 && (
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-1">
              Secondary &amp; Extended Deadlines ({secondaryDeadlines.length})
            </h3>
          )}
          <div className="space-y-4">
            {secondaryDeadlines.map((dl, idx) =>
              renderDeadlineCardItem(dl, primaryDeadlines.length + idx, false)
            )}
          </div>
        </div>
      )}
    </section>
  );
}
