import {
  Calendar,
  Bell,
  AlertTriangle,
  HelpCircle,
  CalendarOff,
  Clock,
} from "lucide-react";
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
        className="surface-card p-6 sm:p-8 space-y-3"
        aria-labelledby="deadlines-heading"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <CalendarOff className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Timeline Status
            </span>
            <h2
              id="deadlines-heading"
              className="text-lg sm:text-xl font-extrabold text-navy-950 tracking-tight"
            >
              Important Deadlines
            </h2>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">
          No deadline is available in the extracted information.
        </p>
        <p className="text-xs text-slate-400">
          Check the original notice before assuming that no deadline applies.
        </p>
      </section>
    );
  }

  const enrichedDeadlines = deadlines.map((deadline, index) => {
    const description =
      deadline.description || deadline.label || "Action Deadline";
    const wording =
      deadline.original_wording ||
      deadline.original_text ||
      deadline.wording ||
      "";
    const dateStr = deadline.iso_date || deadline.date;
    const reason =
      typeof deadline.ambiguity_reason === "string"
        ? deadline.ambiguity_reason
        : "";
    const isConflicting =
      deadline.status === "conflicting" ||
      /two different dates|which one applies/i.test(reason);
    const isAmbiguous =
      !isConflicting &&
      (deadline.is_ambiguous || deadline.ambiguous || Boolean(reason));
    const isUncertain =
      deadline.status === "uncertain" || deadline.needs_verification;
    const role = deadline.role;
    const isPrimary =
      role === "primary" ||
      (!role && index === 0 && !isConflicting && !isAmbiguous);

    return {
      ...deadline,
      description,
      wording,
      dateStr,
      isConflicting,
      isAmbiguous,
      isUncertain,
      isExtended: role === "extended",
      isPrimary,
      countdown:
        dateStr && !isConflicting && !isAmbiguous && !isUncertain
          ? getCountdownDetails(dateStr)
          : null,
      page: deadline.source_page || deadline.evidence?.page,
      quote: deadline.evidence_quote || deadline.evidence?.quote,
    };
  });

  const primaryDeadlines = enrichedDeadlines.filter(
    (deadline) => deadline.isPrimary
  );
  const secondaryDeadlines = enrichedDeadlines.filter(
    (deadline) => !deadline.isPrimary
  );

  const renderCountdownBadge = (countdown) => {
    if (!countdown) return null;

    const badgeClasses = {
      overdue: "bg-rose-50 text-rose-800 border border-rose-200 font-bold",
      critical: "bg-rose-600 text-white font-extrabold animate-pulse shadow-xs",
      urgent: "bg-amber-100 text-amber-950 border border-amber-300 font-bold",
      warning: "bg-amber-50 text-amber-900 border border-amber-200",
      normal: "bg-purple-50 text-purple-800 border border-purple-200",
    };

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
          badgeClasses[countdown.urgency] || badgeClasses.normal
        }`}
      >
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{countdown.label}</span>
      </span>
    );
  };

  const renderDeadlineCardItem = (deadline, index, isHero = false) => (
    <article
      key={`${deadline.description}-${deadline.dateStr || "undated"}-${index}`}
      className={`rounded-2xl p-5 sm:p-6 border transition ${
        deadline.isConflicting || deadline.isAmbiguous
          ? "bg-amber-50/70 border-amber-300"
          : isHero
            ? "bg-gradient-to-br from-purple-50/80 via-white to-cyan-50/40 border-purple-300 shadow-sm"
            : deadline.isExtended
              ? "bg-purple-50/40 border-purple-200"
              : "bg-slate-50/70 border-slate-200"
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {deadline.isConflicting && (
              <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-amber-200 text-amber-950 border border-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Check which date applies
              </span>
            )}
            {deadline.isAmbiguous && (
              <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-amber-200 text-amber-950 border border-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Ambiguous Deadline
              </span>
            )}
            {!deadline.isConflicting &&
              !deadline.isAmbiguous &&
              deadline.isPrimary && (
                <span className="px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-700 text-white shadow-xs">
                  Primary Deadline
                </span>
              )}
            {!deadline.isConflicting &&
              !deadline.isAmbiguous &&
              deadline.isExtended && (
                <span className="px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-purple-100 text-purple-900 border border-purple-200">
                  Later date with fee
                </span>
              )}
            {!deadline.isConflicting &&
              !deadline.isAmbiguous &&
              deadline.role === "consequence" && (
                <span className="px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-slate-200 text-slate-800">
                  Consequence
                </span>
              )}
            {renderCountdownBadge(deadline.countdown)}
            {deadline.isUncertain && (
              <div className="flex flex-wrap items-center gap-2">
                <UncertainBadge />
                <span className="text-xs text-amber-900 font-medium">
                  We could not match this exactly to your notice. Please check the original.
                </span>
              </div>
            )}
          </div>

          <h3
            className={`font-black text-navy-950 leading-snug ${
              isHero ? "text-lg sm:text-2xl" : "text-base sm:text-lg"
            }`}
          >
            {deadline.description}
          </h3>

          <div
            className={`font-black tracking-tight text-purple-700 ${
              isHero ? "text-2xl sm:text-4xl" : "text-xl sm:text-2xl"
            }`}
          >
            {deadline.dateStr
              ? formatDate(deadline.dateStr)
              : deadline.wording || "Date not specified"}
          </div>

          {deadline.wording && (
            <p className="text-xs sm:text-sm text-slate-600 font-medium pt-0.5">
              Exact notice wording:{" "}
              <span className="italic font-bold text-navy-950">
                &ldquo;{deadline.wording}&rdquo;
              </span>
            </p>
          )}

          {(deadline.isConflicting || deadline.isAmbiguous) &&
            deadline.ambiguity_reason && (
              <div className="mt-2.5 p-3.5 bg-amber-100/80 border border-amber-300 rounded-xl text-xs sm:text-sm text-amber-950 flex items-start gap-2.5">
                <HelpCircle
                  className="w-4 h-4 text-amber-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <span className="font-bold">
                    {deadline.isConflicting
                      ? "Action needed: "
                      : "Why this date is unclear: "}
                  </span>
                  <span>{deadline.ambiguity_reason}</span>
                </div>
              </div>
            )}
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col gap-2 pt-2 lg:pt-0 self-stretch sm:self-auto lg:min-w-[170px]">
          {deadline.dateStr &&
            !deadline.isConflicting &&
            !deadline.isAmbiguous &&
            !deadline.isUncertain && (
              <AddToCalendarButton
                title={`${noticeTitle} - ${deadline.description}`}
                description={`Official deadline: ${
                  deadline.wording || deadline.description
                }`}
                dateStr={deadline.dateStr}
                noticeId={noticeId}
              />
            )}

          {onRemind && (
            <button
              type="button"
              onClick={() => onRemind(deadline)}
              className="focus-ring w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-purple min-h-[40px] transition"
            >
              <Bell className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Remind Me</span>
            </button>
          )}

          {onShowSource && deadline.page && (
            <button
              type="button"
              onClick={() => onShowSource(deadline.page, deadline.quote)}
              className="focus-ring w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-navy-950 min-h-[40px] transition"
            >
              Show Source
            </button>
          )}
        </div>
      </div>
    </article>
  );

  return (
    <section
      className="surface-card border-2 border-purple-300/80 p-6 sm:p-8 space-y-6 shadow-card"
      aria-labelledby="deadlines-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-cyan-50 text-purple-700 border border-purple-200">
            <Calendar className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
              Urgent Attention Required
            </span>
            <h2
              id="deadlines-heading"
              className="text-xl sm:text-2xl font-black text-navy-950 tracking-tight"
            >
              Notice Deadlines
            </h2>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
          {deadlines.length} {deadlines.length === 1 ? "Deadline" : "Deadlines"} Found
        </span>
      </div>

      {primaryDeadlines.length > 0 && (
        <div className="space-y-4">
          {primaryDeadlines.map((deadline, index) =>
            renderDeadlineCardItem(deadline, index, true)
          )}
        </div>
      )}

      {secondaryDeadlines.length > 0 && (
        <div className="space-y-3 pt-2">
          {primaryDeadlines.length > 0 && (
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-1">
              Secondary &amp; Extended Deadlines ({secondaryDeadlines.length})
            </h3>
          )}
          <div className="space-y-4">
            {secondaryDeadlines.map((deadline, index) =>
              renderDeadlineCardItem(
                deadline,
                primaryDeadlines.length + index
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
