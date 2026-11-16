import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Upload,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  ArrowRight,
  ShieldCheck,
  Loader2,
  Sparkles,
} from "lucide-react";
import { listNotices, getUpcomingReminders, updateReminder } from "../api/client";
import { getCountdownDetails, formatDate } from "../utils/text";

export function DashboardPage() {
  const [notices, setNotices] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [noticeList, upcomingList] = await Promise.all([
        listNotices().catch((e) => {
          throw e;
        }),
        getUpcomingReminders(14).catch(() => []),
      ]);
      setNotices(noticeList || []);
      setReminders(upcomingList || []);
    } catch (err) {
      setError(
        err.message ||
        "Could not connect to the backend server. Please verify the API is running."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Toggle reminder status directly from dashboard checklist
  const handleToggleReminder = async (rem) => {
    try {
      const updated = await updateReminder(rem.id, { done: !rem.done });
      setReminders((prev) =>
        prev.map((item) => (item.id === rem.id ? updated : item))
      );
    } catch (err) {
      alert(err.message || "Could not update checklist item.");
    }
  };

  // Derive real statistics from live data
  const stats = useMemo(() => {
    const totalNotices = notices.length;
    const actionsPending = reminders.filter((r) => !r.done).length;
    const upcomingDeadlines = reminders.filter((r) => !r.done && r.remind_on).length;
    const requiresAttention = notices.filter(
      (n) =>
        n.needs_verification ||
        n.status === "needs_clearer_document" ||
        n.status === "extraction_failed"
    ).length;

    return {
      totalNotices,
      actionsPending,
      upcomingDeadlines,
      requiresAttention,
    };
  }, [notices, reminders]);

  // Derive alert notice (e.g. first notice requiring attention or conflicting dates)
  const alertNotice = useMemo(() => {
    return notices.find(
      (n) =>
        n.needs_verification ||
        n.status === "needs_clearer_document" ||
        n.status === "extraction_failed"
    );
  }, [notices]);

  // Action steps checklist progress
  const checklistProgress = useMemo(() => {
    if (reminders.length === 0) return 0;
    const completed = reminders.filter((r) => r.done).length;
    return Math.round((completed / reminders.length) * 100);
  }, [reminders]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 1. Welcome Section */}
      <section
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-charcoal-900 via-charcoal-800 to-forest-900 text-white p-6 sm:p-8 lg:p-10 shadow-elevated border border-charcoal-800"
        aria-labelledby="welcome-banner-heading"
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AITM Institutional Dashboard</span>
            </div>
            <h1
              id="welcome-banner-heading"
              className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight"
            >
              Welcome back, Aysha! 👋
            </h1>
            <p className="text-stone-300 text-sm sm:text-base font-medium">
              Stay informed. Meet your deadlines. Zero-hallucination institutional notice management.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-extrabold text-sm text-charcoal-950 bg-teal-400 hover:bg-teal-300 shadow-teal transition-all min-h-[44px]"
            >
              <Upload className="w-4 h-4" />
              <span>Upload New Notice</span>
            </Link>
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm text-stone-200 bg-charcoal-800/80 hover:bg-charcoal-700 border border-charcoal-700 transition-all min-h-[44px]"
            >
              <span>View All Notices</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Subtle background decorative shapes */}
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Backend connection error banner if offline */}
      {error && !loading && (
        <div
          role="alert"
          className="p-5 sm:p-6 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-3 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-amber-950">
                Backend Connection Notice
              </h2>
              <p className="text-sm text-amber-900 leading-relaxed font-medium">
                {error}
              </p>
              <p className="text-xs text-amber-800">
                Ensure the FastAPI backend server is running via{" "}
                <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">
                  uvicorn backend.app.main:app --port 8000
                </code>
                .
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-800 hover:bg-amber-900 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-stone-600">
          <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
          <p className="font-bold text-sm sm:text-base">Loading live institutional metrics...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* 2. Top Metric Stat Cards */}
          <section
            aria-label="Summary Statistics"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5"
          >
            {/* Total Notices */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-card flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Total Notices
                </span>
                <p className="text-2xl sm:text-3xl font-black text-stone-900">
                  {stats.totalNotices}
                </p>
                <span className="text-[11px] text-stone-500 font-medium block">
                  Logged in system
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            {/* Actions Pending */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-card flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Actions Pending
                </span>
                <p className="text-2xl sm:text-3xl font-black text-stone-900">
                  {stats.actionsPending}
                </p>
                <span className="text-[11px] text-stone-500 font-medium block">
                  Active checklist steps
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-sage-100 text-sage-800 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            {/* Upcoming Deadlines */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-card flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Upcoming Deadlines
                </span>
                <p className="text-2xl sm:text-3xl font-black text-stone-900">
                  {stats.upcomingDeadlines}
                </p>
                <span className="text-[11px] text-stone-500 font-medium block">
                  Next 14 calendar days
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
            </div>

            {/* Requires Attention */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-card flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Requires Attention
                </span>
                <p className="text-2xl sm:text-3xl font-black text-stone-900">
                  {stats.requiresAttention}
                </p>
                <span className="text-[11px] text-stone-500 font-medium block">
                  Needs verification
                </span>
              </div>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${stats.requiresAttention > 0
                    ? "bg-coral-100 text-coral-800"
                    : "bg-stone-100 text-stone-500"
                  }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
          </section>

          {/* 3. Three-Column Interactive Layout matching reference */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Column 1: Important Deadlines Section */}
            <section
              className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-card space-y-4"
              aria-labelledby="dashboard-deadlines-title"
            >
              <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <h2
                    id="dashboard-deadlines-title"
                    className="font-extrabold text-base text-stone-950"
                  >
                    Important Deadlines
                  </h2>
                </div>
                <Link
                  to="/calendar"
                  className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {reminders.length === 0 ? (
                <div className="text-center py-8 space-y-2 text-stone-500">
                  <Clock className="w-8 h-8 mx-auto text-stone-300" />
                  <p className="text-xs sm:text-sm font-medium">No deadlines recorded yet.</p>
                  <p className="text-[11px] text-stone-400">
                    Upload an official notice to track its cutoffs automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reminders.slice(0, 4).map((rem) => {
                    const countdown = rem.remind_on ? getCountdownDetails(rem.remind_on) : null;
                    let badgeClass = "bg-teal-50 text-teal-800 border-teal-200";
                    if (countdown?.urgency === "overdue" || countdown?.urgency === "critical") {
                      badgeClass = "bg-coral-100 text-coral-900 border-coral-300 font-black";
                    } else if (countdown?.urgency === "urgent") {
                      badgeClass = "bg-amber-100 text-amber-900 border-amber-300";
                    }

                    return (
                      <div
                        key={rem.id}
                        className="p-3 rounded-2xl bg-stone-50 border border-stone-200/80 hover:border-teal-300 transition-all space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${badgeClass}`}
                          >
                            {countdown?.label || "Upcoming"}
                          </span>
                          <span className="text-[11px] font-mono text-stone-500">
                            {formatDate(rem.remind_on)}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm font-extrabold text-stone-900 leading-snug">
                            {rem.note || rem.deadline_ref || "Notice Requirement"}
                          </p>
                          {rem.notice_id && (
                            <Link
                              to={`/notices/${rem.notice_id}`}
                              className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold underline mt-1 inline-block"
                            >
                              Notice #{rem.notice_id.slice(0, 8)} &rarr;
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Column 2: Action Steps Checklist with Progress Bar */}
            <section
              className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-card space-y-4"
              aria-labelledby="dashboard-actions-title"
            >
              <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sage-100 text-sage-800">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h2
                    id="dashboard-actions-title"
                    className="font-extrabold text-base text-stone-950"
                  >
                    Your Action Steps
                  </h2>
                </div>
                <Link
                  to="/reminders"
                  className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-stone-700">
                  <span>Task Completion</span>
                  <span>{checklistProgress}%</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-teal-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
              </div>

              {reminders.length === 0 ? (
                <div className="text-center py-8 space-y-2 text-stone-500">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-stone-300" />
                  <p className="text-xs sm:text-sm font-medium">No active action steps.</p>
                  <p className="text-[11px] text-stone-400">
                    Notice requirements will populate as interactive checklist items.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {reminders.slice(0, 4).map((rem) => (
                    <div
                      key={rem.id}
                      className="p-2.5 rounded-xl border border-stone-200/80 hover:bg-stone-50 transition-colors flex items-start gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleReminder(rem)}
                        aria-label={rem.done ? "Mark undone" : "Mark action done"}
                        className="mt-0.5 text-stone-400 hover:text-teal-600 focus:outline-hidden focus:ring-2 focus:ring-teal-600 rounded p-0.5"
                      >
                        {rem.done ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-stone-400" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-bold leading-snug ${rem.done ? "line-through text-stone-400" : "text-stone-900"
                            }`}
                        >
                          {rem.note || rem.deadline_ref || "Review and execute required notice step"}
                        </p>
                        <span className="text-[10px] text-stone-500 font-medium">
                          Due: {formatDate(rem.remind_on)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Column 3: Notice Alert & Source Verification */}
            <div className="space-y-6">
              {/* Notice Alert Card */}
              <section
                className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-card space-y-3"
                aria-labelledby="notice-alert-title"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-coral-100 text-coral-800">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <h2 id="notice-alert-title" className="font-extrabold text-base text-stone-950">
                    Notice Alert
                  </h2>
                </div>

                {alertNotice ? (
                  <div className="p-4 rounded-2xl bg-coral-50/80 border border-coral-200/80 space-y-2">
                    <p className="text-xs font-bold text-coral-950 leading-snug">
                      Notice requires check: {alertNotice.title || "Official Notice"}
                    </p>
                    <p className="text-[11px] text-coral-900 leading-relaxed font-medium">
                      {alertNotice.status === "needs_clearer_document"
                        ? "The uploaded file has blurry or scanned text requiring a clearer scan."
                        : "One or more dates/claims need cross-verification against the original PDF."}
                    </p>
                    <Link
                      to={`/notices/${alertNotice.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-coral-600 text-white hover:bg-coral-700 transition-colors shadow-xs"
                    >
                      <span>View Details</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-sage-50/80 border border-sage-200/80 space-y-1">
                    <p className="text-xs font-extrabold text-sage-950">All Clear &amp; Grounded</p>
                    <p className="text-[11px] text-sage-900 font-medium">
                      No conflicting dates or ungrounded claims detected across your uploaded notices.
                    </p>
                  </div>
                )}
              </section>

              {/* Source Verified Institutional Trust Card */}
              <section
                className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-card space-y-3"
                aria-labelledby="source-verified-title"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h2
                    id="source-verified-title"
                    className="font-extrabold text-base text-stone-950"
                  >
                    Source Verified
                  </h2>
                </div>
                <div className="space-y-1 text-xs text-stone-600 leading-relaxed font-medium">
                  <p>
                    Information is extracted strictly from official notice documents. Every deadline,
                    checklist requirement, and action item links back to its exact source page and
                    verbatim quote.
                  </p>
                </div>
                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-teal-700">Zero Hallucination Guarantee</span>
                  <Link to="/settings" className="text-stone-500 hover:text-stone-900 underline">
                    Learn more
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}