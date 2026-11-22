import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  getUpcomingReminders,
  listNotices,
  updateReminder,
} from "../api/client";
import { useWorkspacePreferences } from "../context/useWorkspacePreferences";
import { getCategoryLabel } from "../utils/categories";
import { formatDate, getCountdownDetails } from "../utils/text";
import {
  getNoticeField,
  getNoticePriority,
  isHighPriorityNotice,
} from "../utils/notices";

const REMINDER_WINDOW_DAYS = 90;

function isNoticeForReview(notice) {
  return (
    notice.needs_verification ||
    ["needs_clearer_document", "extraction_failed"].includes(notice.status)
  );
}

function MetricCard({ label, value, note, icon: Icon, tone }) {
  const tones = {
    purple: "bg-purple-50 text-purple-700",
    cyan: "bg-cyan-50 text-cyan-800",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
    navy: "bg-navy-50 text-navy-700",
  };

  return (
    <article className="surface-card flex min-h-32 items-start justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-navy-950">
          {value}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{note}</p>
      </div>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </article>
  );
}

function getNoticeUrgencyRank(notice) {
  const urgency = notice.headline?.urgency || notice.urgency;
  if (urgency === "overdue") return 0;
  if (urgency === "urgent") return 1;
  if (urgency === "soon") return 2;
  if (urgency === "none") return 3;

  const deadlineDate =
    notice.deadlines?.[0]?.date ||
    notice.result?.deadlines?.[0]?.iso_date ||
    notice.result?.deadlines?.[0]?.date;
  if (deadlineDate) {
    const cd = getCountdownDetails(deadlineDate);
    if (cd) {
      if (cd.isOverdue) return 0;
      if (cd.urgency === "critical" || cd.urgency === "urgent") return 1;
      if (cd.urgency === "warning") return 2;
      return 3;
    }
  }

  const priority = (getNoticePriority(notice) || "").toLowerCase();
  if (["critical", "urgent"].includes(priority)) return 1;
  if (priority === "high") return 2;
  return 4;
}

function NoticeLink({ notice, attention = false }) {
  const title =
    notice.headline?.one_line_summary ||
    getNoticeField(notice, ["title", "notice_title"]) ||
    notice.original_filename ||
    "Untitled document";
  const source =
    notice.headline?.source_organisation ||
    getNoticeField(notice, [
      "source_organisation",
      "source_organization",
      "issuing_organisation",
      "issuing_organization",
      "issuer",
    ]) || "Source organisation not listed";
  const category = getCategoryLabel(notice.category || notice.headline?.notice_type);
  const status = (notice.status || "Status not reported").replaceAll("_", " ");

  const amountDue = notice.headline?.amount_due || notice.amount_due;
  const formattedAmount =
    amountDue && typeof amountDue.amount === "number"
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: amountDue.currency || "INR",
          maximumFractionDigits: 0,
        }).format(amountDue.amount)
      : null;

  const primaryDeadlineDate =
    notice.deadlines?.[0]?.date ||
    notice.result?.deadlines?.[0]?.iso_date ||
    notice.result?.deadlines?.[0]?.date;
  const countdown = primaryDeadlineDate ? getCountdownDetails(primaryDeadlineDate) : null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-purple-300 hover:shadow-xs space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/notices/${notice.id}`}
            className="focus-ring rounded-sm text-sm font-extrabold leading-5 text-navy-950 hover:text-purple-800 line-clamp-2"
          >
            {title}
          </Link>
          <p className="mt-1 truncate text-xs text-slate-500 font-medium">{source}</p>
        </div>
        {countdown ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
              countdown.urgency === "overdue"
                ? "bg-rose-100 text-rose-800 border border-rose-300"
                : countdown.daysRemaining <= 3
                ? "bg-amber-100 text-amber-900 border border-amber-300"
                : "bg-emerald-100 text-emerald-900 border border-emerald-300"
            }`}
          >
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            {countdown.label}
          </span>
        ) : attention ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Review
          </span>
        ) : (
          <span className="max-w-36 truncate rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
            {category}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
        {formattedAmount ? (
          <span className="font-black text-navy-950 text-sm">{formattedAmount}</span>
        ) : (
          <span className="text-slate-400 font-medium">{category}</span>
        )}
        <Link
          to={`/notices/${notice.id}`}
          className="text-[11px] font-bold text-purple-700 hover:underline inline-flex items-center gap-1"
        >
          <span>View plan</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const [notices, setNotices] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noticeError, setNoticeError] = useState(null);
  const [reminderError, setReminderError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const { focusCategories } = useWorkspacePreferences();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setNoticeError(null);
    setReminderError(null);
    const [noticeResult, reminderResult] = await Promise.allSettled([
      listNotices(),
      getUpcomingReminders(REMINDER_WINDOW_DAYS),
    ]);

    if (noticeResult.status === "fulfilled") {
      setNotices(Array.isArray(noticeResult.value) ? noticeResult.value : []);
    } else {
      setNoticeError(
        noticeResult.reason?.message || "Could not load notices from the service."
      );
    }

    if (reminderResult.status === "fulfilled") {
      setReminders(Array.isArray(reminderResult.value) ? reminderResult.value : []);
    } else {
      setReminderError(
        reminderResult.reason?.message ||
          "Could not load saved action reminders from the service."
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleReminder = async (reminder) => {
    setActionError(null);
    try {
      const updated = await updateReminder(reminder.id, {
        done: !reminder.done,
      });
      setReminders((current) =>
        current.map((item) => (item.id === reminder.id ? updated : item))
      );
    } catch (error) {
      setActionError(error.message || "Could not update this reminder.");
    }
  };

  const stats = useMemo(() => {
    const openReminders = reminders.filter((reminder) => !reminder.done);
    return {
      pending: openReminders.length,
      upcoming: openReminders.filter((reminder) => {
        const countdown = getCountdownDetails(reminder.remind_on);
        return countdown && countdown.daysRemaining >= 0;
      }).length,
      overdue: openReminders.filter(
        (reminder) =>
          getCountdownDetails(reminder.remind_on)?.urgency === "overdue"
      ).length,
      attention: notices.filter(isNoticeForReview).length,
    };
  }, [notices, reminders]);

  const categoryCounts = useMemo(() => {
    const counts = new Map();
    notices.forEach((notice) => {
      const key = notice.category || "unclassified";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].sort((first, second) => second[1] - first[1]);
  }, [notices]);

  const needActionThisWeek = useMemo(() => {
    return notices.filter((n) => {
      const d =
        n.deadlines?.[0]?.date ||
        n.result?.deadlines?.[0]?.iso_date ||
        n.result?.deadlines?.[0]?.date;
      if (!d) return false;
      const cd = getCountdownDetails(d);
      return cd && (cd.isOverdue || cd.daysRemaining <= 7);
    }).length;
  }, [notices]);

  const recentNotices = useMemo(
    () =>
      [...notices]
        .sort((first, second) => {
          const rankDiff = getNoticeUrgencyRank(first) - getNoticeUrgencyRank(second);
          if (rankDiff !== 0) return rankDiff;
          return (
            new Date(second.created_at || 0).getTime() -
            new Date(first.created_at || 0).getTime()
          );
        })
        .slice(0, 4),
    [notices]
  );

  const attentionNotices = useMemo(
    () => notices.filter(isNoticeForReview).slice(0, 3),
    [notices]
  );

  const highPriorityNotices = useMemo(
    () => notices.filter(isHighPriorityNotice).slice(0, 3),
    [notices]
  );

  const sortedReminders = useMemo(
    () =>
      [...reminders]
        .sort((first, second) => {
          if (first.done !== second.done) return first.done ? 1 : -1;
          return (
            new Date(first.remind_on || 0).getTime() -
            new Date(second.remind_on || 0).getTime()
          );
        })
        .slice(0, 5),
    [reminders]
  );

  return (
    <main className="page-shell space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-purple-900 p-6 text-white shadow-elevated sm:p-8 lg:p-9">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Notice intelligence workspace
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Turn complex notices into clear next steps.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-200 sm:text-base">
              Organise communications from different organisations, review extracted
              information, and keep deadlines and actions together. Developed at
              AITM; this workspace is designed for broader use.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/upload"
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-navy-950 transition hover:bg-cyan-200"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload document
            </Link>
            <Link
              to="/notices"
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Browse notices
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full border-[48px] border-white/[0.035]" />
      </section>

      {(noticeError || reminderError) && !loading && (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="space-y-1 text-sm">
              <p className="font-bold">Some workspace data is unavailable.</p>
              {noticeError && <p className="text-xs leading-5">{noticeError}</p>}
              {reminderError && <p className="text-xs leading-5">{reminderError}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="focus-ring inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </section>
      )}

      {actionError && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {actionError}
        </p>
      )}

      {loading ? (
        <div className="surface-card flex min-h-56 flex-col items-center justify-center gap-3 text-slate-600">
          <Loader2 className="h-9 w-9 animate-spin text-purple-600" aria-hidden="true" />
          <p className="text-sm font-semibold">Loading your workspace data…</p>
        </div>
      ) : (
        <>
          <section
            aria-label="Workspace statistics"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
          >
            <MetricCard
              label="Total notices"
              value={noticeError ? "—" : notices.length}
              note="Records returned by the service"
              icon={FileText}
              tone="purple"
            />
            <MetricCard
              label="Pending actions"
              value={reminderError ? "—" : stats.pending}
              note={`Saved reminders in the ${REMINDER_WINDOW_DAYS}-day feed`}
              icon={CheckCircle2}
              tone="cyan"
            />
            <MetricCard
              label="Upcoming deadlines"
              value={reminderError ? "—" : stats.upcoming}
              note="Open reminders due today or later"
              icon={CalendarDays}
              tone="amber"
            />
            <MetricCard
              label="Overdue actions"
              value={reminderError ? "—" : stats.overdue}
              note="Open reminders past their date"
              icon={Clock3}
              tone="rose"
            />
            <MetricCard
              label="Needs review"
              value={noticeError ? "—" : stats.attention}
              note="Extraction or verification flags"
              icon={AlertTriangle}
              tone="navy"
            />
          </section>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.8fr)]">
            <div className="min-w-0 space-y-5">
              <section className="surface-card p-5 sm:p-6" aria-labelledby="recent-notices-title">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <p className="page-heading-eyebrow">Priority actions</p>
                    <h2 id="recent-notices-title" className="text-lg font-extrabold text-navy-950">
                      {needActionThisWeek > 0
                        ? `${needActionThisWeek} ${needActionThisWeek === 1 ? "notice needs" : "notices need"} action this week`
                        : "Recent notices and documents"}
                    </h2>
                  </div>
                  <Link to="/notices" className="focus-ring inline-flex items-center gap-1 rounded text-xs font-bold text-purple-700 hover:text-purple-900">
                    All notices <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                {noticeError ? (
                  <p className="py-5 text-sm text-slate-500">Recent records are unavailable until the notice service responds.</p>
                ) : recentNotices.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {recentNotices.map((notice) => (
                      <NoticeLink key={notice.id} notice={notice} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                    <FileText className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">Your notice library is ready.</p>
                    <p className="mt-1 text-xs text-slate-500">Upload a supported PDF to start reviewing extracted information and actions.</p>
                    <Link to="/upload" className="mt-3 inline-flex text-xs font-bold text-purple-700 hover:underline">Upload a document</Link>
                  </div>
                )}
              </section>

              <section className="surface-card p-5 sm:p-6" aria-labelledby="actions-title">
                <div className="mb-4 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <p className="page-heading-eyebrow">What to do next</p>
                    <h2 id="actions-title" className="text-lg font-extrabold text-navy-950">Saved action reminders</h2>
                  </div>
                  <Link to="/reminders" className="focus-ring inline-flex items-center gap-1 rounded text-xs font-bold text-purple-700 hover:text-purple-900">
                    Manage <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                {reminderError ? (
                  <p className="py-5 text-sm text-slate-500">Saved reminders are unavailable until the reminder service responds.</p>
                ) : sortedReminders.length ? (
                  <ul className="divide-y divide-slate-100">
                    {sortedReminders.map((reminder) => {
                      const countdown = getCountdownDetails(reminder.remind_on);
                      return (
                        <li key={reminder.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                          <button
                            type="button"
                            onClick={() => handleToggleReminder(reminder)}
                            aria-label={reminder.done ? "Mark reminder incomplete" : "Mark reminder complete"}
                            className="focus-ring mt-0.5 rounded text-slate-400 hover:text-purple-700"
                          >
                            <CheckCircle2 className={`h-5 w-5 ${reminder.done ? "text-emerald-600" : ""}`} aria-hidden="true" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold ${reminder.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                              {reminder.note || reminder.deadline_ref || "Saved action"}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                              <span>{formatDate(reminder.remind_on)}</span>
                              {!reminder.done && countdown && (
                                <span className={countdown.urgency === "overdue" ? "font-bold text-rose-700" : "font-semibold text-purple-700"}>
                                  {countdown.label}
                                </span>
                              )}
                              {reminder.notice_id && (
                                <Link to={`/notices/${reminder.notice_id}`} className="font-semibold text-purple-700 hover:underline">
                                  Source notice
                                </Link>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="py-6 text-center">
                    <BellRing className="mx-auto h-7 w-7 text-slate-300" aria-hidden="true" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">No saved reminders in this feed.</p>
                    <p className="mt-1 text-xs text-slate-500">Create a reminder from a notice deadline to keep an action visible here.</p>
                  </div>
                )}
              </section>
            </div>

            <aside className="min-w-0 space-y-5">
              <section className="surface-card p-5 sm:p-6" aria-labelledby="category-summary-title">
                <div className="mb-4">
                  <p className="page-heading-eyebrow">Across your library</p>
                  <h2 id="category-summary-title" className="text-lg font-extrabold text-navy-950">Category summary</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Counts reflect categories returned by the current processor, not a limit on the platform’s intended use.</p>
                </div>
                {noticeError ? (
                  <p className="py-4 text-sm text-slate-500">Category data is unavailable.</p>
                ) : categoryCounts.length ? (
                  <ul className="space-y-2.5">
                    {categoryCounts.map(([category, count]) => (
                      <li key={category} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-slate-700">{getCategoryLabel(category === "unclassified" ? null : category)}</span>
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-purple-50 px-2 text-xs font-bold text-purple-800">{count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-sm text-slate-500">Category summaries will appear when the service returns notice records.</p>
                )}
                {focusCategories.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Your focus categories</p>
                    <div className="flex flex-wrap gap-2">
                      {focusCategories.map((category) => {
                        const count = categoryCounts.find(([key]) => key === category)?.[1] || 0;
                        return (
                          <Link
                            key={category}
                            to={`/notices?category=${encodeURIComponent(category)}`}
                            className="focus-ring inline-flex items-center gap-2 rounded-full border border-purple-100 bg-purple-50 px-2.5 py-1.5 text-[11px] font-semibold text-purple-800 hover:bg-purple-100"
                          >
                            {getCategoryLabel(category)} <span className="font-bold">{count}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="surface-card p-5 sm:p-6" aria-labelledby="attention-title">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 id="attention-title" className="text-base font-extrabold text-navy-950">Needs your review</h2>
                </div>
                {noticeError ? (
                  <p className="py-3 text-sm text-slate-500">Review flags are unavailable.</p>
                ) : attentionNotices.length ? (
                  <div className="space-y-2.5">
                    {attentionNotices.map((notice) => (
                      <NoticeLink key={notice.id} notice={notice} attention />
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-sm leading-5 text-slate-500">No review flags were returned for these records. Check extracted details against their originals before acting.</p>
                )}
              </section>

              <section className="surface-card p-5 sm:p-6" aria-labelledby="priority-title">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 id="priority-title" className="text-base font-extrabold text-navy-950">High-priority notices</h2>
                </div>
                {noticeError ? (
                  <p className="py-3 text-sm text-slate-500">Priority data is unavailable.</p>
                ) : highPriorityNotices.length ? (
                  <div className="space-y-2.5">
                    {highPriorityNotices.map((notice) => (
                      <NoticeLink key={notice.id} notice={notice} />
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-sm leading-5 text-slate-500">No priority ratings were supplied by the current notice service.</p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
