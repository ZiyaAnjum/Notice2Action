import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock,
  Filter,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { getUpcomingReminders, listNotices } from "../api/client";
import { formatDate, getCountdownDetails } from "../utils/text";
import { AddToCalendarButton } from "../components/AddToCalendarButton";
import { PageHeader } from "../components/PageHeader";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseLocalDate(value) {
  if (typeof value !== "string" || !value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function sameDay(first, second) {
  return first && second && dateKey(first) === dateKey(second);
}

export function CalendarPage() {
  const [reminders, setReminders] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reminderError, setReminderError] = useState(null);
  const [noticeError, setNoticeError] = useState(null);
  const [filterMode, setFilterMode] = useState("all");
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const loadCalendarData = useCallback(async () => {
    setLoading(true);
    setReminderError(null);
    setNoticeError(null);
    try {
      const [reminderResult, noticeResult] = await Promise.allSettled([
        getUpcomingReminders(90),
        listNotices(),
      ]);
      if (reminderResult.status === "fulfilled") {
        setReminders(Array.isArray(reminderResult.value) ? reminderResult.value : []);
      } else {
        setReminderError(
          reminderResult.reason?.message || "Failed to load saved deadlines."
        );
      }
      if (noticeResult.status === "fulfilled") {
        setNotices(Array.isArray(noticeResult.value) ? noticeResult.value : []);
      } else {
        setNoticeError(
          noticeResult.reason?.message || "Could not load source document titles."
        );
      }
    } catch (err) {
      setReminderError(err?.message || "Failed to load calendar data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendarData();
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [loadCalendarData]);

  const noticesMap = useMemo(
    () => Object.fromEntries(notices.map((notice) => [notice.id, notice])),
    [notices]
  );

  const filteredReminders = useMemo(
    () =>
      reminders.filter((reminder) => {
        if (filterMode === "completed") return reminder.done;
        if (reminder.done && filterMode !== "all") return false;
        const countdown = reminder.remind_on
          ? getCountdownDetails(reminder.remind_on)
          : null;
        if (filterMode === "overdue") return countdown?.urgency === "overdue";
        if (filterMode === "upcoming") return countdown?.urgency !== "overdue";
        return true;
      }),
    [reminders, filterMode]
  );

  const remindersByDate = useMemo(() => {
    const map = new Map();
    filteredReminders.forEach((reminder) => {
      const date = parseLocalDate(reminder.remind_on);
      if (!date) return;
      const key = dateKey(date);
      map.set(key, [...(map.get(key) || []), reminder]);
    });
    return map;
  }, [filteredReminders]);

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1
    );
    const gridStart = new Date(
      firstOfMonth.getFullYear(),
      firstOfMonth.getMonth(),
      1 - firstOfMonth.getDay()
    );
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index
      );
      return { date, reminders: remindersByDate.get(dateKey(date)) || [] };
    });
  }, [visibleMonth, remindersByDate]);

  const selectedReminders = remindersByDate.get(dateKey(selectedDate)) || [];
  const visibleMonthReminderCount = calendarDays.reduce(
    (count, day) =>
      day.date.getMonth() === visibleMonth.getMonth() &&
      day.date.getFullYear() === visibleMonth.getFullYear()
        ? count + day.reminders.length
        : count,
    0
  );

  const orderedDeadlines = useMemo(
    () =>
      [...filteredReminders]
        .filter((reminder) => reminder.remind_on)
        .sort(
          (first, second) =>
            new Date(first.remind_on).getTime() - new Date(second.remind_on).getTime()
        )
        .slice(0, 5),
    [filteredReminders]
  );

  const changeMonth = (amount) => {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + amount, 1)
    );
    setSelectedDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + amount, 1)
    );
  };

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "upcoming", label: "Upcoming" },
    { key: "overdue", label: "Overdue" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <main className="page-shell space-y-6">
      <PageHeader
        icon={CalendarDays}
        eyebrow="Timeline &amp; Schedule"
        title="Deadlines &amp; Calendar"
        description="Visualize extracted action deadlines and reminders on a unified institutional timeline. Track deadlines due across your active courses and departments."
        actions={
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter deadlines">
            <Filter className="mr-1 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterMode(tab.key)}
                aria-pressed={filterMode === tab.key}
                className={`focus-ring min-h-9 rounded-xl px-3 text-xs font-bold transition ${
                  filterMode === tab.key
                    ? "bg-purple-700 text-white shadow-purple"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-purple-50 hover:text-purple-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      {loading && (
        <div className="surface-card flex flex-col items-center justify-center gap-3 py-20 text-slate-600">
          <Loader2 className="h-9 w-9 animate-spin text-purple-600" aria-hidden="true" />
          <p className="text-xs sm:text-sm font-bold">Loading deadline calendar…</p>
        </div>
      )}

      {reminderError && !loading && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 space-y-3 ui-fade-in"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-700" aria-hidden="true" />
              <h2 className="text-sm font-extrabold">Could not load saved deadlines</h2>
            </div>
            <button
              type="button"
              onClick={loadCalendarData}
              className="focus-ring inline-flex min-h-8 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
          <p className="text-xs text-amber-900">{reminderError}</p>
        </div>
      )}

      {noticeError && !loading && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 ui-fade-in">
          Source document titles could not be loaded. Saved deadlines remain available. {noticeError}
        </p>
      )}

      {!loading && (
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
          {/* Monthly Calendar Grid */}
          <section className="surface-card min-w-0 overflow-hidden p-5 sm:p-6" aria-label="Monthly calendar">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-black text-navy-950">
                  {visibleMonth.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 font-medium">
                  {visibleMonthReminderCount} deadline{visibleMonthReminderCount === 1 ? "" : "s"} scheduled this month
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  aria-label="Previous month"
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-navy-950 transition"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                    setSelectedDate(today);
                  }}
                  className="focus-ring h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  aria-label="Next month"
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-navy-950 transition"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Weekday Labels */}
            <div className="grid grid-cols-7 border-b border-slate-100 pb-2 text-center">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 sm:text-xs">
                  {day}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 border-l border-t border-slate-100 rounded-b-xl overflow-hidden">
              {calendarDays.map(({ date, reminders: dayReminders }) => {
                const outsideMonth = date.getMonth() !== visibleMonth.getMonth();
                const isToday = sameDay(date, new Date());
                const isSelected = sameDay(date, selectedDate);
                return (
                  <button
                    key={dateKey(date)}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    aria-label={`${date.toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}${dayReminders.length ? `, ${dayReminders.length} reminder${dayReminders.length === 1 ? "" : "s"}` : ""}`}
                    aria-pressed={isSelected}
                    className={`focus-ring flex min-h-[80px] min-w-0 flex-col items-start border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-[96px] sm:p-2 ${
                      outsideMonth ? "bg-slate-50/50 text-slate-300" : "bg-white text-slate-700"
                    } ${isSelected ? "z-10 ring-2 ring-inset ring-purple-600 bg-purple-50/30" : "hover:bg-purple-50/40"}`}
                  >
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-extrabold ${
                        isToday
                          ? "bg-purple-700 text-white shadow-xs"
                          : outsideMonth
                            ? "text-slate-300"
                            : "text-navy-950"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <span className="mt-1 flex w-full flex-col gap-1 overflow-hidden">
                      {dayReminders.slice(0, 2).map((reminder) => {
                        const overdue =
                          !reminder.done &&
                          getCountdownDetails(reminder.remind_on)?.urgency === "overdue";
                        return (
                          <span
                            key={reminder.id}
                            className={`w-full truncate rounded px-1.5 py-0.5 text-left text-[9px] font-bold leading-tight sm:text-[10px] ${
                              reminder.done
                                ? "bg-slate-100 text-slate-400 line-through"
                                : overdue
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-purple-50 text-purple-800 border border-purple-100"
                            }`}
                          >
                            {reminder.note || reminder.deadline_ref || "Deadline"}
                          </span>
                        );
                      })}
                      {dayReminders.length > 2 && (
                        <span className="text-[9px] font-bold text-slate-400">
                          +{dayReminders.length - 2} more
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500 font-semibold border-t border-slate-100 pt-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-600" /> Upcoming
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Overdue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Completed
              </span>
            </div>
          </section>

          {/* Right Sidebar: Selected Day & Overview */}
          <aside className="space-y-6">
            {/* Selected day details card */}
            <section className="surface-card p-5 sm:p-6" aria-labelledby="selected-day-title">
              <div className="mb-4 border-b border-slate-100 pb-3">
                <p className="page-heading-eyebrow">Selected Date</p>
                <h2 id="selected-day-title" className="mt-1 text-base font-extrabold text-navy-950">
                  {selectedDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </h2>
              </div>
              {selectedReminders.length === 0 ? (
                <p className="py-4 text-xs text-slate-500 leading-relaxed font-medium">
                  No saved deadlines for this date. Click on any active date cell to inspect scheduled actions.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedReminders.map((reminder) => {
                    const notice = noticesMap[reminder.notice_id];
                    const countdown = getCountdownDetails(reminder.remind_on);
                    return (
                      <article key={reminder.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            reminder.done
                              ? "bg-slate-200 text-slate-600"
                              : countdown?.urgency === "overdue"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-purple-100 text-purple-800"
                          }`}>
                            {reminder.done ? "Completed" : countdown?.label || "Upcoming"}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {formatDate(reminder.remind_on)}
                          </span>
                        </div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-navy-950 leading-snug">
                          {reminder.note || reminder.deadline_ref || "Official deadline"}
                        </h3>
                        {notice && (
                          <p className="text-xs text-slate-500 font-medium">
                            From: <span className="font-bold text-navy-950">{notice.title}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                          <AddToCalendarButton
                            title={reminder.note || reminder.deadline_ref || "Notice deadline"}
                            description={notice ? `Deadline from notice: ${notice.title}` : ""}
                            dateStr={reminder.remind_on}
                            noticeId={reminder.notice_id}
                          />
                          {reminder.notice_id && (
                            <Link
                              to={`/notices/${reminder.notice_id}`}
                              className="text-xs font-bold text-purple-700 hover:text-purple-900 transition"
                            >
                              Open notice →
                            </Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Deadline Overview */}
            <section className="surface-card p-5 sm:p-6" aria-labelledby="deadline-overview-title">
              <div className="mb-3.5 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Clock className="h-4 w-4 text-purple-700" aria-hidden="true" />
                <h2 id="deadline-overview-title" className="text-sm font-extrabold text-navy-950">
                  Upcoming Feed Overview
                </h2>
              </div>
              {orderedDeadlines.length === 0 ? (
                <p className="py-2 text-xs leading-relaxed text-slate-500">
                  No upcoming deadlines match this filter. Add reminders from any notice page.
                </p>
              ) : (
                <ul className="space-y-3">
                  {orderedDeadlines.map((reminder) => (
                    <li key={reminder.id} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-navy-950">
                          {reminder.note || reminder.deadline_ref || "Notice deadline"}
                        </p>
                        {reminder.notice_id && (
                          <Link
                            to={`/notices/${reminder.notice_id}`}
                            className="mt-0.5 inline-block text-[11px] font-bold text-purple-700 hover:underline"
                          >
                            View notice
                          </Link>
                        )}
                      </div>
                      <time className="shrink-0 text-[11px] font-semibold text-slate-500">
                        {formatDate(reminder.remind_on)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
