import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock,
  Filter,
  Loader2,
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

  useEffect(() => {
    async function loadCalendarData() {
      setLoading(true);
      setReminderError(null);
      setNoticeError(null);
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
      setLoading(false);
    }
    loadCalendarData();
  }, []);

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
        eyebrow="Plan ahead"
        title="Deadlines & calendar"
        description="Review saved reminders from communications across your library. The calendar shows the current 90-day reminder feed; extracted dates appear here only after a reminder is saved."
        actions={
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter deadlines">
            <Filter className="mr-1 h-4 w-4 text-slate-400" aria-hidden="true" />
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterMode(tab.key)}
                aria-pressed={filterMode === tab.key}
                className={`focus-ring min-h-9 rounded-xl px-3 text-xs font-bold transition ${
                  filterMode === tab.key
                    ? "bg-purple-700 text-white shadow-xs"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      {loading && (
        <div className="surface-card flex flex-col items-center justify-center gap-3 py-16 text-slate-600">
          <Loader2 className="h-9 w-9 animate-spin text-purple-600" aria-hidden="true" />
          <p className="text-sm font-semibold">Loading saved deadlines…</p>
        </div>
      )}

      {reminderError && !loading && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-700" aria-hidden="true" />
            <h2 className="text-sm font-extrabold">Could not load saved deadlines</h2>
          </div>
            <p className="mt-2 text-xs leading-5 text-amber-900">{reminderError}</p>
        </div>
      )}

      {noticeError && !loading && !reminderError && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
            Source document titles could not be loaded. Saved deadlines remain available. {noticeError}
        </p>
      )}

      {!loading && !reminderError && (
        <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
          <section className="surface-card min-w-0 overflow-hidden p-4 sm:p-5" aria-label="Monthly calendar">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-navy-950">
                  {visibleMonth.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {visibleMonthReminderCount} reminder{visibleMonthReminderCount === 1 ? "" : "s"} this month
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  aria-label="Previous month"
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
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
                  className="focus-ring h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  aria-label="Next month"
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-100 pb-2 text-center">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:text-xs">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 border-l border-t border-slate-100">
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
                    className={`focus-ring flex min-h-[76px] min-w-0 flex-col items-start border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-[94px] sm:p-2 ${
                      outsideMonth ? "bg-slate-50/60 text-slate-300" : "bg-white text-slate-700"
                    } ${isSelected ? "z-10 ring-2 ring-inset ring-purple-500" : "hover:bg-purple-50/50"}`}
                  >
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                        isToday
                          ? "bg-navy-950 text-white"
                          : outsideMonth
                            ? "text-slate-300"
                            : "text-slate-700"
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
                            className={`w-full truncate rounded px-1 py-0.5 text-left text-[9px] font-semibold leading-3 sm:text-[10px] ${
                              reminder.done
                                ? "bg-slate-100 text-slate-500 line-through"
                                : overdue
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-purple-50 text-purple-800"
                            }`}
                          >
                            {reminder.note || reminder.deadline_ref || "Deadline"}
                          </span>
                        );
                      })}
                      {dayReminders.length > 2 && (
                        <span className="text-[9px] font-semibold text-slate-500">
                          +{dayReminders.length - 2} more
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-500" /> Upcoming
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Overdue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" /> Completed
              </span>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="surface-card p-5" aria-labelledby="selected-day-title">
              <div className="mb-4 border-b border-slate-100 pb-3">
                <p className="page-heading-eyebrow">Selected day</p>
                <h2 id="selected-day-title" className="mt-1 text-base font-extrabold text-navy-950">
                  {selectedDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </h2>
              </div>
              {selectedReminders.length === 0 ? (
                <p className="py-3 text-sm leading-6 text-slate-500">
                  No saved reminders for this date.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedReminders.map((reminder) => {
                    const notice = noticesMap[reminder.notice_id];
                    const countdown = getCountdownDetails(reminder.remind_on);
                    return (
                      <article key={reminder.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                            reminder.done
                              ? "bg-slate-200 text-slate-600"
                              : countdown?.urgency === "overdue"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-purple-100 text-purple-800"
                          }`}>
                            {reminder.done ? "Completed" : countdown?.label || "Upcoming"}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {formatDate(reminder.remind_on)}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-bold leading-5 text-navy-950">
                          {reminder.note || reminder.deadline_ref || "Official deadline"}
                        </h3>
                        {notice && (
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            From: <span className="font-semibold text-slate-700">{notice.title}</span>
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                          <AddToCalendarButton
                            title={reminder.note || reminder.deadline_ref || "Notice deadline"}
                            description={notice ? `Deadline from notice: ${notice.title}` : ""}
                            dateStr={reminder.remind_on}
                            noticeId={reminder.notice_id}
                          />
                          {reminder.notice_id && (
                            <Link
                              to={`/notices/${reminder.notice_id}`}
                              className="text-xs font-bold text-purple-700 hover:text-purple-900"
                            >
                              Open notice
                            </Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="surface-card p-5" aria-labelledby="deadline-overview-title">
              <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Clock className="h-4 w-4 text-purple-700" aria-hidden="true" />
                <h2 id="deadline-overview-title" className="text-sm font-extrabold text-navy-950">
                  Deadline overview
                </h2>
              </div>
              {orderedDeadlines.length === 0 ? (
                <p className="py-2 text-xs leading-5 text-slate-500">
                  No saved deadlines match this filter. Add reminders from a notice detail page.
                </p>
              ) : (
                <ul className="space-y-3">
                  {orderedDeadlines.map((reminder) => (
                    <li key={reminder.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">
                          {reminder.note || reminder.deadline_ref || "Notice deadline"}
                        </p>
                        {reminder.notice_id && (
                          <Link
                            to={`/notices/${reminder.notice_id}`}
                            className="mt-1 inline-block text-[11px] font-semibold text-purple-700 hover:underline"
                          >
                            View notice
                          </Link>
                        )}
                      </div>
                      <time className="shrink-0 text-[11px] font-medium text-slate-500">
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
