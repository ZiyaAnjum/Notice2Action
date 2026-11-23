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
    purple: {
      bg: "bg-purple-50",
      text: "text-purple-700",
      border: "border-purple-100",
      iconBg: "bg-purple-100/80 text-purple-700",
    },
    cyan: {
      bg: "bg-cyan-50",
      text: "text-cyan-800",
      border: "border-cyan-100",
      iconBg: "bg-cyan-100/80 text-cyan-800",
    },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-100",
      iconBg: "bg-amber-100/80 text-amber-800",
    },
    rose: {
      bg: "bg-rose-50",
      text: "text-rose-800",
      border: "border-rose-100",
      iconBg: "bg-rose-100/80 text-rose-800",
    },
    navy: {
      bg: "bg-navy-50",
      text: "text-navy-800",
      border: "border-navy-100",
      iconBg: "bg-navy-100/80 text-navy-800",
    },
  };

  const style = tones[tone] || tones.purple;

  return (
    <article className="surface-card surface-card-hover flex min-h-32 flex-col justify-between p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-navy-950">
          {value}
        </p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500 font-medium">{note}</p>
      </div>
    </article>
  );
}

function NoticeLink({ notice, attention = false }) {
  const title =
    getNoticeField(notice, ["title", "notice_title"]) ||
    notice.original_filename ||
    "Untitled document";
  const source =
    getNoticeField(notice, [
      "source_organisation",
      "source_organization",
      "issuing_organisation",
      "issuing_organization",
      "issuer",
    ]) || "Source organisation not listed";
  const category = getCategoryLabel(notice.category);
  const issueDate = getNoticeField(notice, ["issue_date", "issued_at"]);
  const status = (notice.status || "Status not reported").replaceAll("_", " ");
  const priority = getNoticePriority(notice);

  return (
    <article className="surface-card surface-card-hover p-4 transition">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/notices/${notice.id}`}
            className="focus-ring block rounded text-sm font-extrabold leading-snug text-navy-950 transition hover:text-purple-700"
          >
            {title}
          </Link>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">{source}</p>
        </div>
        {attention ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Review
          </span>
        ) : (
          <span className="max-w-36 truncate rounded-full bg-purple-50 border border-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-700">
            {category}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 font-medium">
        <span className="capitalize">{status}</span>
        <span>•</span>
        <span>
          {issueDate ? `Issued ${formatDate(issueDate)}` : `Added ${formatDate(notice.created_at)}`}
        </span>
        {priority && (
          <>
            <span>•</span>
            <span className="font-bold text-rose-700 capitalize">
              {priority} priority
            </span>
          </>
        )}
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
    try {
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
    } catch (err) {
      setNoticeError(err?.message || "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);
    return () => clearTimeout(timer);
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

  const recentNotices = useMemo(
    () =>
      [...notices]
        .sort(
          (first, second) =>
            new Date(second.created_at || 0).getTime() -
            new Date(first.created_at || 0).getTime()
        )
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
      {/* Welcome Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-950 via-navy-900 to-purple-900 p-6 text-white shadow-elevated sm:p-8 lg:p-9">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Notice Intelligence Workspace
            </span>
            <h1 className="mt-3.5 text-2xl font-black tracking-tight sm:text-4xl text-white">
              Turn complex notices into clear next steps.
            </h1>
            <p className="mt-2.5 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-300">
              Organize communications from different institutions, inspect extracted
              deadlines and document checklists, and keep track of pending student actions.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/upload"
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-300 px-4 py-2.5 text-xs sm:text-sm font-extrabold text-navy-950 shadow-cyan-glow transition hover:brightness-105"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload Document
            </Link>
            <Link
              to="/notices"
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition hover:bg-white/20"
            >
              Browse Notices
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[40px] border-white/[0.04]" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl" />
      </section>

      {/* Error / Alert banner */}
      {(noticeError || reminderError) && !loading && (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between ui-fade-in"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="space-y-0.5 text-xs sm:text-sm">
              <p className="font-extrabold">Some workspace data is unavailable.</p>
              {noticeError && <p className="text-xs text-amber-900">{noticeError}</p>}
              {reminderError && <p className="text-xs text-amber-900">{reminderError}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="focus-ring inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </section>
      )}

      {actionError && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800 ui-fade-in">
          {actionError}
        </p>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="surface-card flex min-h-60 flex-col items-center justify-center gap-3 py-16 text-slate-600">
          <Loader2 className="h-9 w-9 animate-spin text-purple-600" aria-hidden="true" />
          <p className="text-xs sm:text-sm font-bold text-slate-700">Loading your workspace data…</p>
        </div>
      ) : (
        <>
          {/* 5 KPI Metric Cards */}
          <section
            aria-label="Workspace statistics"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
          >
            <MetricCard
              label="Total notices"
              value={noticeError ? "—" : notices.length}
              note="Processed records"
              icon={FileText}
              tone="purple"
            />
            <MetricCard
              label="Pending actions"
              value={reminderError ? "—" : stats.pending}
              note="Saved reminder feed"
              icon={CheckCircle2}
              tone="cyan"
            />
            <MetricCard
              label="Upcoming deadlines"
              value={reminderError ? "—" : stats.upcoming}
              note="Due today or later"
              icon={CalendarDays}
              tone="amber"
            />
            <MetricCard
              label="Overdue actions"
              value={reminderError ? "—" : stats.overdue}
              note="Past deadline date"
              icon={Clock3}
              tone="rose"
            />
            <MetricCard
              label="Needs review"
              value={noticeError ? "—" : stats.attention}
              note="Requires verification"
              icon={AlertTriangle}
              tone="navy"
            />
          </section>

          {/* Main Content Grid */}
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
            {/* Left Column: Recent Notices & Action Reminders */}
            <div className="min-w-0 space-y-6">
              {/* Recent notices */}
              <section className="surface-card p-5 sm:p-6" aria-labelledby="recent-notices-title">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <p className="page-heading-eyebrow">Document Feed</p>
                    <h2 id="recent-notices-title" className="text-base sm:text-lg font-extrabold text-navy-950">
                      Recent Notices &amp; Circulars
                    </h2>
                  </div>
                  <Link
                    to="/notices"
                    className="focus-ring inline-flex items-center gap-1 rounded text-xs font-bold text-purple-700 hover:text-purple-900 transition"
                  >
                    All notices <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                {noticeError ? (
                  <p className="py-6 text-xs text-slate-500">Notice records are unavailable until the service responds.</p>
                ) : recentNotices.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {recentNotices.map((notice) => (
                      <NoticeLink key={notice.id} notice={notice} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
                    <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                    <p className="mt-2 text-sm font-bold text-navy-950">Your notice library is ready.</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Upload a PDF communication to extract key deadlines and required documents.
                    </p>
                    <Link
                      to="/upload"
                      className="mt-3 inline-flex text-xs font-bold text-purple-700 hover:underline"
                    >
                      Upload a notice now
                    </Link>
                  </div>
                )}
              </section>

              {/* Action checklist */}
              <section className="surface-card p-5 sm:p-6" aria-labelledby="actions-title">
                <div className="mb-4 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <p className="page-heading-eyebrow">Action Checklist</p>
                    <h2 id="actions-title" className="text-base sm:text-lg font-extrabold text-navy-950">
                      Saved Action Reminders
                    </h2>
                  </div>
                  <Link
                    to="/reminders"
                    className="focus-ring inline-flex items-center gap-1 rounded text-xs font-bold text-purple-700 hover:text-purple-900 transition"
                  >
                    Manage <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                {reminderError ? (
                  <p className="py-6 text-xs text-slate-500">Saved reminders are unavailable until the service responds.</p>
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
                            className="focus-ring mt-0.5 rounded text-slate-400 hover:text-purple-700 transition"
                          >
                            <CheckCircle2
                              className={`h-5 w-5 ${reminder.done ? "text-emerald-600" : "text-slate-300"}`}
                              aria-hidden="true"
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs sm:text-sm font-bold ${reminder.done ? "text-slate-400 line-through" : "text-navy-950"}`}>
                              {reminder.note || reminder.deadline_ref || "Saved action item"}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium">
                              <span>Due {formatDate(reminder.remind_on)}</span>
                              {!reminder.done && countdown && (
                                <span className={countdown.urgency === "overdue" ? "font-bold text-rose-700" : "font-bold text-purple-700"}>
                                  {countdown.label}
                                </span>
                              )}
                              {reminder.notice_id && (
                                <Link
                                  to={`/notices/${reminder.notice_id}`}
                                  className="font-bold text-purple-700 hover:underline"
                                >
                                  View Notice
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
                    <p className="mt-2 text-xs sm:text-sm font-bold text-slate-700">No saved reminders in this feed.</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Create reminders on any notice detail page to organize deadlines here.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* Right Column: Categories & Alerts */}
            <aside className="min-w-0 space-y-6">
              {/* Categories Summary */}
              <section className="surface-card p-5 sm:p-6" aria-labelledby="category-summary-title">
                <div className="mb-4">
                  <p className="page-heading-eyebrow">Library Overview</p>
                  <h2 id="category-summary-title" className="text-base sm:text-lg font-extrabold text-navy-950">
                    Category Breakdown
                  </h2>
                </div>
                {noticeError ? (
                  <p className="py-4 text-xs text-slate-500">Category data is unavailable.</p>
                ) : categoryCounts.length ? (
                  <ul className="space-y-2.5">
                    {categoryCounts.map(([category, count]) => (
                      <li key={category} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate font-semibold text-slate-700">
                          {getCategoryLabel(category === "unclassified" ? null : category)}
                        </span>
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg bg-purple-50 border border-purple-100 px-2 text-xs font-black text-purple-800">
                          {count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-xs text-slate-500">Category counts will populate once notices are processed.</p>
                )}
                {focusCategories.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3.5">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Your Focus Categories
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {focusCategories.map((category) => {
                        const count = categoryCounts.find(([key]) => key === category)?.[1] || 0;
                        return (
                          <Link
                            key={category}
                            to={`/notices?category=${encodeURIComponent(category)}`}
                            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-800 hover:bg-purple-100 transition"
                          >
                            {getCategoryLabel(category)} <span className="font-bold">{count}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Needs Review Alert box */}
              <section className="surface-card p-5 sm:p-6" aria-labelledby="attention-title">
                <div className="mb-3.5 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 id="attention-title" className="text-sm font-extrabold text-navy-950">
                    Needs your review
                  </h2>
                </div>
                {noticeError ? (
                  <p className="py-2 text-xs text-slate-500">Review flags are unavailable.</p>
                ) : attentionNotices.length ? (
                  <div className="space-y-2.5">
                    {attentionNotices.map((notice) => (
                      <NoticeLink key={notice.id} notice={notice} attention />
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-xs leading-relaxed text-slate-500 font-medium">
                    No active review flags reported. Confirm details against original documents before taking official action.
                  </p>
                )}
              </section>

              {/* High Priority notices */}
              <section className="surface-card p-5 sm:p-6" aria-labelledby="priority-title">
                <div className="mb-3.5 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 id="priority-title" className="text-sm font-extrabold text-navy-950">
                    High-priority notices
                  </h2>
                </div>
                {noticeError ? (
                  <p className="py-2 text-xs text-slate-500">Priority data is unavailable.</p>
                ) : highPriorityNotices.length ? (
                  <div className="space-y-2.5">
                    {highPriorityNotices.map((notice) => (
                      <NoticeLink key={notice.id} notice={notice} />
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-xs leading-relaxed text-slate-500 font-medium">
                    No urgent or high-priority notices flagged right now.
                  </p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
