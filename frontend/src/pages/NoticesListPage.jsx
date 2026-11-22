import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteNotice,
  getUpcomingReminders,
  listNotices,
  updateReminder,
} from "../api/client";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { PageHeader } from "../components/PageHeader";
import { SUPPORTED_CATEGORIES, getCategoryLabel } from "../utils/categories";
import { formatDate, getCountdownDetails } from "../utils/text";
import {
  getNoticeDeadlines,
  getNoticeField,
  getNoticePriority,
} from "../utils/notices";

const INITIAL_FILTERS = {
  category: "all",
  status: "all",
  priority: "all",
  sort: "newest",
};

function getNoticeTitle(notice) {
  return (
    getNoticeField(notice, ["title", "notice_title"]) ||
    notice.original_filename ||
    "Untitled document"
  );
}

function getNoticeStatusLabel(status) {
  if (!status) return "Status not reported";
  return status.replaceAll("_", " ");
}

function getStatusTone(status) {
  if (status === "processing") return "bg-cyan-50 text-cyan-800";
  if (status === "needs_clearer_document") return "bg-amber-50 text-amber-800";
  if (status === "extraction_failed") return "bg-rose-50 text-rose-800";
  if (status === "out_of_scope") return "bg-slate-100 text-slate-700";
  if (status === "processed") return "bg-emerald-50 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function getNoticeSortDate(notice, sortMode) {
  if (sortMode === "issue-date") {
    return getNoticeField(notice, ["issue_date", "issued_at"]);
  }
  const result =
    notice?.result && typeof notice.result === "object" ? notice.result : {};
  const deadlines = Array.isArray(result.deadlines) ? result.deadlines : [];
  return deadlines
    .map((deadline) => deadline?.iso_date || deadline?.date)
    .find((date) => typeof date === "string" && !Number.isNaN(Date.parse(date))) || "";
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

function getPriorityRank(notice) {
  const ranks = { critical: 0, urgent: 1, high: 2, medium: 3, low: 4 };
  return ranks[getNoticePriority(notice).toLowerCase()] ?? 5;
}

function searchValues(notice) {
  return [
    getNoticeTitle(notice),
    getNoticeField(notice, [
      "source_organisation",
      "source_organization",
      "issuing_organisation",
      "issuing_organization",
      "issuer",
    ]),
    getNoticeField(notice, ["notice_type", "document_type", "type"]),
    getNoticePriority(notice),
    notice.category,
    notice.status,
    notice.original_filename,
    getNoticeField(notice, ["issue_date", "issued_at"]),
    getNoticeDeadlines(notice),
    notice.deadline_summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function NoticesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notices, setNotices] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noticeError, setNoticeError] = useState(null);
  const [reminderError, setReminderError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [filters, setFilters] = useState(() => ({
    ...INITIAL_FILTERS,
    category: searchParams.get("category") || "all",
  }));
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setNoticeError(null);
    setReminderError(null);
    const [noticeResult, reminderResult] = await Promise.allSettled([
      listNotices(),
      getUpcomingReminders(14),
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
          "Could not load saved reminders from the service."
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setSearchTerm(searchParams.get("q") || "");
    setFilters((current) => ({
      ...current,
      category: searchParams.get("category") || "all",
    }));
  }, [searchParams]);

  const categories = useMemo(() => {
    const keys = new Set([
      ...SUPPORTED_CATEGORIES.map(({ key }) => key),
      ...notices.map((notice) => notice.category).filter(Boolean),
    ]);
    return [...keys].sort((first, second) =>
      getCategoryLabel(first).localeCompare(getCategoryLabel(second))
    );
  }, [notices]);

  const filteredNotices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return notices
      .filter((notice) => {
        if (query && !searchValues(notice).includes(query)) return false;
        if (filters.category !== "all" && notice.category !== filters.category) {
          return false;
        }
        if (filters.status === "needs_review") {
          if (!notice.needs_verification) return false;
        } else if (filters.status !== "all" && notice.status !== filters.status) {
          return false;
        }
        if (
          filters.priority !== "all" &&
          getNoticePriority(notice).toLowerCase() !== filters.priority
        ) {
          return false;
        }
        return true;
      })
      .sort((first, second) => {
        if (filters.sort === "newest" || filters.sort === "urgency") {
          const rankDiff = getNoticeUrgencyRank(first) - getNoticeUrgencyRank(second);
          if (rankDiff !== 0) return rankDiff;
          const firstDate = new Date(first.created_at || 0).getTime();
          const secondDate = new Date(second.created_at || 0).getTime();
          return secondDate - firstDate;
        }
        if (filters.sort === "title") {
          return getNoticeTitle(first).localeCompare(getNoticeTitle(second));
        }
        if (filters.sort === "priority") {
          return getPriorityRank(first) - getPriorityRank(second);
        }
        if (filters.sort === "deadline" || filters.sort === "issue-date") {
          const firstDate = getNoticeSortDate(first, filters.sort);
          const secondDate = getNoticeSortDate(second, filters.sort);
          return (
            (firstDate ? Date.parse(firstDate) : Number.POSITIVE_INFINITY) -
            (secondDate ? Date.parse(secondDate) : Number.POSITIVE_INFINITY)
          );
        }
        const firstDate = new Date(first.created_at || 0).getTime();
        const secondDate = new Date(second.created_at || 0).getTime();
        return filters.sort === "oldest" ? firstDate - secondDate : secondDate - firstDate;
      });
  }, [notices, searchTerm, filters]);

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

  const setFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setSearchTerm("");
    setFilters(INITIAL_FILTERS);
    setSearchParams({});
  };

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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    setIsDeleting(true);
    try {
      await deleteNotice(deleteTarget.id);
      setNotices((current) =>
        current.filter((notice) => notice.id !== deleteTarget.id)
      );
      setDeleteTarget(null);
    } catch (error) {
      setActionError(error.message || "Could not delete this document.");
    } finally {
      setIsDeleting(false);
    }
  };

  const hasActiveFilters =
    searchTerm.trim() ||
    filters.category !== "all" ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.sort !== "newest";

  return (
    <main className="page-shell space-y-6">
      <PageHeader
        icon={FileText}
        eyebrow="Your document library"
        title="Notices & documents"
        description="Find communications from different organisations, review the processing status, and open extracted actions. Details shown depend on what the connected service returns."
        actions={
          <Link
            to="/upload"
            className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-purple-800"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload document
          </Link>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {actionError}
        </p>
      )}

      {(noticeError || reminderError) && !loading && (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="space-y-1 text-xs leading-5">
              {noticeError && <p><strong>Notice library:</strong> {noticeError}</p>}
              {reminderError && <p><strong>Reminder feed:</strong> {reminderError}</p>}
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

      {!loading && !noticeError && notices.length > 0 && (
        <section className="surface-card p-4 sm:p-5" aria-labelledby="reminder-feed-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-800">
                <Bell className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 id="reminder-feed-title" className="text-sm font-extrabold text-navy-950">
                  Saved reminders
                </h2>
                <p className="text-[11px] text-slate-500">The reminder service returns its 14-day feed.</p>
              </div>
            </div>
            <Link to="/reminders" className="focus-ring inline-flex items-center gap-1 rounded text-xs font-bold text-purple-700 hover:text-purple-900">
              All reminders <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {reminderError ? (
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Reminder data is unavailable. The notice library remains usable.
            </p>
          ) : reminders.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {reminders.slice(0, 4).map((reminder) => {
                const countdown = !reminder.done && getCountdownDetails(reminder.remind_on);
                return (
                  <article key={reminder.id} className="flex min-w-0 items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <button
                      type="button"
                      onClick={() => handleToggleReminder(reminder)}
                      aria-label={reminder.done ? "Mark reminder incomplete" : "Mark reminder complete"}
                      className="focus-ring mt-0.5 rounded text-slate-400 hover:text-purple-700"
                    >
                      <CheckCircle2 className={`h-4 w-4 ${reminder.done ? "text-emerald-600" : ""}`} aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-xs font-semibold ${reminder.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {reminder.note || reminder.deadline_ref || "Saved action"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden="true" />{formatDate(reminder.remind_on)}</span>
                        {countdown && <span className={countdown.urgency === "overdue" ? "font-bold text-rose-700" : "font-semibold text-purple-700"}>{countdown.label}</span>}
                        {reminder.notice_id && <Link to={`/notices/${reminder.notice_id}`} className="font-semibold text-purple-700 hover:underline">Source document</Link>}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              No reminders were returned for this feed. You can create one from a notice detail page.
            </p>
          )}
        </section>
      )}

      <section className="surface-card p-4 sm:p-5" aria-label="Search and filter notices">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(140px,0.75fr))]">
          <label className="relative block min-w-0">
            <span className="sr-only">Search notices and documents</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, source, category, deadline…"
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-300 focus:bg-white"
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Filter by category</span>
            <select
              value={filters.category}
              onChange={(event) => setFilter("category", event.target.value)}
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{getCategoryLabel(category)}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">Filter by processing status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilter("status", event.target.value)}
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              <option value="all">All processing states</option>
              <option value="needs_review">Needs review</option>
              {[...new Set(notices.map((notice) => notice.status).filter(Boolean))].sort().map((status) => (
                <option key={status} value={status}>{getNoticeStatusLabel(status)}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">Filter by priority</span>
            <select
              value={filters.priority}
              onChange={(event) => setFilter("priority", event.target.value)}
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              <option value="all">Any priority</option>
              <option value="critical">Critical</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{noticeError ? "Notice records unavailable" : `${filteredNotices.length} of ${notices.length} records`}</span>
            {hasActiveFilters && (
              <button type="button" onClick={resetFilters} className="focus-ring rounded font-bold text-purple-700 hover:text-purple-900">
                Clear filters
              </button>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sort by</span>
            <select
              value={filters.sort}
              onChange={(event) => setFilter("sort", event.target.value)}
              className="focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="newest">Recently added</option>
              <option value="oldest">Oldest added</option>
              <option value="title">Title</option>
              <option value="issue-date">Issue date</option>
              <option value="deadline">Deadline date</option>
              <option value="priority">Priority</option>
            </select>
          </label>
        </div>
      </section>

      <section aria-labelledby="notice-results-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="page-heading-eyebrow">Search results</p>
            <h2 id="notice-results-title" className="text-xl font-extrabold text-navy-950">
              {needActionThisWeek > 0
                ? `${needActionThisWeek} ${needActionThisWeek === 1 ? "notice needs" : "notices need"} action this week`
                : "Your library"}
            </h2>
          </div>
          {!loading && !noticeError && (
            <p className="text-xs text-slate-500">Source, priority, issue date, and type appear when supplied by the service.</p>
          )}
        </div>

        {needActionThisWeek > 0 && !loading && (
          <aside
            role="status"
            className="mb-4 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-950 font-bold text-xs sm:text-sm shadow-xs"
          >
            <div className="flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-purple-700 shrink-0" aria-hidden="true" />
              <span>
                {needActionThisWeek} {needActionThisWeek === 1 ? "notice needs" : "notices need"} action this week
              </span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full shrink-0">
              Action required
            </span>
          </aside>
        )}

        {loading ? (
          <div className="surface-card flex min-h-52 flex-col items-center justify-center gap-3 text-slate-600">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" aria-hidden="true" />
            <p className="text-sm font-semibold">Loading your library…</p>
          </div>
        ) : noticeError ? (
          <div className="surface-card p-8 text-center">
            <AlertTriangle className="mx-auto h-9 w-9 text-amber-600" aria-hidden="true" />
            <h3 className="mt-3 text-base font-bold text-navy-950">Notice records could not be loaded</h3>
            <p className="mt-1 text-sm text-slate-600">{noticeError}</p>
            <button type="button" onClick={fetchData} className="focus-ring mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-purple-700 px-4 text-xs font-bold text-white hover:bg-purple-800">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </button>
          </div>
        ) : notices.length === 0 ? (
          <div className="surface-card border-dashed p-8 text-center sm:p-12">
            <FileText className="mx-auto h-11 w-11 text-slate-300" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-bold text-navy-950">No documents yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
              Upload a supported PDF communication to request extraction of its summary, key dates, and actionable steps.
            </p>
            <Link to="/upload" className="focus-ring mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-purple-700 px-4 text-sm font-bold text-white hover:bg-purple-800">
              <Upload className="h-4 w-4" aria-hidden="true" /> Upload a document
            </Link>
          </div>
        ) : filteredNotices.length === 0 ? (
          <div className="surface-card p-8 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <h3 className="mt-2 text-sm font-bold text-navy-950">No matching records</h3>
            <p className="mt-1 text-xs text-slate-500">Try another search term or clear one or more filters.</p>
            <button type="button" onClick={resetFilters} className="focus-ring mt-3 rounded font-bold text-xs text-purple-700 hover:underline">Clear filters</button>
          </div>
        ) : (
          <div className="grid items-stretch gap-4 md:grid-cols-2">
            {filteredNotices.map((notice) => {
              const title = getNoticeTitle(notice);
              const oneLineSummary = notice.headline?.one_line_summary || title;
              const issuer = getNoticeField(notice, [
                "source_organisation",
                "source_organization",
                "issuing_organisation",
                "issuing_organization",
                "issuer",
              ]);
              const noticeType = getNoticeField(notice, ["notice_type", "document_type", "type"]);
              const priority = getNoticePriority(notice);
              const issueDate = getNoticeField(notice, ["issue_date", "issued_at"]);
              const deadline = getNoticeDeadlines(notice);
              const status = notice.status;

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
                <article key={notice.id} className="surface-card surface-card-hover flex min-w-0 flex-col p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="max-w-[70%] truncate rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-800">
                        {getCategoryLabel(notice.category)}
                      </span>
                      {countdown && (
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
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
                      )}
                    </div>
                    <span className={`max-w-[45%] truncate rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${getStatusTone(status)}`}>
                      {getNoticeStatusLabel(status)}
                    </span>
                  </div>

                  <h3 className="mt-3 line-clamp-2 text-base font-extrabold leading-6 text-navy-950">
                    <Link to={`/notices/${notice.id}`} className="focus-ring rounded hover:text-purple-800">
                      {oneLineSummary}
                    </Link>
                  </h3>

                  {formattedAmount && (
                    <div className="mt-1 flex items-baseline gap-1.5 text-navy-950">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount:</span>
                      <span className="text-base font-black tracking-tight">{formattedAmount}</span>
                    </div>
                  )}

                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 text-xs">
                    <div className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Source organisation</dt>
                      <dd className="mt-1 truncate font-medium text-slate-700">{issuer || "Not provided"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Document type</dt>
                      <dd className="mt-1 truncate font-medium text-slate-700">{noticeType || "Not classified"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Priority</dt>
                      <dd className="mt-1 flex items-center gap-1.5 font-medium text-slate-700">
                        {priority ? (
                          <>
                            {["high", "urgent", "critical"].includes(priority.toLowerCase()) && (
                              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
                            )}
                            <span className="capitalize">{priority}</span>
                          </>
                        ) : "Not rated"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Issue date</dt>
                      <dd className="mt-1 font-medium text-slate-700">{issueDate ? formatDate(issueDate) : "Not provided"}</dd>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <dt className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <Clock3 className="h-3 w-3" aria-hidden="true" /> Deadline information · extracted
                      </dt>
                      <dd className="mt-1 break-words font-medium text-slate-700">{deadline || "Not returned by the service"}</dd>
                    </div>
                  </dl>

                  {notice.needs_verification && (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      Some extracted information needs review
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(notice)}
                      className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
                      aria-label={`Delete ${title}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>Added {formatDate(notice.created_at)}</span>
                      <Link
                        to={`/notices/${notice.id}`}
                        className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-purple-50 px-3 text-xs font-bold text-purple-800 transition hover:bg-purple-100"
                      >
                        Open details <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <DeleteConfirmModal
        title={deleteTarget ? getNoticeTitle(deleteTarget) : ""}
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </main>
  );
}
