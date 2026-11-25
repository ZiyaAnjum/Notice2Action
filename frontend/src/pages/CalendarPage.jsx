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
  Bell,
} from "lucide-react";
import { getUpcomingReminders, listNotices } from "../api/client";
import { formatDate, getCountdownDetails } from "../utils/text";
import { AddToCalendarButton } from "../components/AddToCalendarButton";
import { PageHeader } from "../components/PageHeader";
import { ReminderModal } from "../components/ReminderModal";

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

  const [reminderModal, setReminderModal] = useState({
    isOpen: false,
    noticeId: null,
    deadline: null,
    noticeDate: null,
  });

  const noticesMap = useMemo(
    () => Object.fromEntries(notices.map((notice) => [notice.id, notice])),
    [notices]
  );

  // Combine saved reminders and extracted notice deadlines into unified institutional timeline events
  const allEvents = useMemo(() => {
    const list = [];
    const reminderKeys = new Set();

    // 1. Saved reminders in database
    (reminders || []).forEach((r) => {
      const key = `${r.notice_id}_${r.remind_on}_${(r.deadline_ref || "").trim().toLowerCase()}`;
      reminderKeys.add(key);
      list.push({
        id: `rem_${r.id}`,
        rawId: r.id,
        isReminder: true,
        notice_id: r.notice_id,
        date: r.remind_on,
        remind_on: r.remind_on,
        label: r.note || r.deadline_ref || "Notice deadline",
        note: r.note,
        deadline_ref: r.deadline_ref,
        done: Boolean(r.done),
        urgency: "fixed",
      });
    });

    // 2. Extracted deadlines from notices
    (notices || []).forEach((n) => {
      const dls = Array.isArray(n.deadlines) ? n.deadlines : [];
      dls.forEach((d, idx) => {
        const itemDate = d.date || d.iso_date;
        const itemLabel = d.label || d.description || "Notice deadline";
        if (itemDate) {
          const key = `${n.id}_${itemDate}_${itemLabel.trim().toLowerCase()}`;
          if (!reminderKeys.has(key)) {
            list.push({
              id: `dl_${n.id}_${idx}`,
              isReminder: false,
              notice_id: n.id,
              date: itemDate,
              remind_on: itemDate,
              label: itemLabel,
              done: false,
              urgency: d.urgency || "fixed",
              date_type: d.date_type || "exact",
              deadline_item: d,
            });
          }
        }
      });
    });

    return list;
  }, [reminders, notices]);

  // Notices requiring ASAP action without a fixed calendar due date
  const asapNotices = useMemo(() => {
    const list = [];
    (notices || []).forEach((n) => {
      const dls = Array.isArray(n.deadlines) ? n.deadlines : [];
      const hasFixed = dls.some((d) => d.date || d.iso_date);
      const asapItem = dls.find((d) => d.urgency === "asap" || /earliest|immediate|asap/i.test(d.label || ""));
      if (asapItem || (!hasFixed && dls.length > 0)) {
        list.push({
          notice: n,
          deadline: asapItem || dls[0],
          noticeDate: n.notice_date,
        });
      }
    });
    return list;
  }, [notices]);

  const filteredEvents = useMemo(
    () =>
      allEvents.filter((event) => {
        if (filterMode === "completed") return event.done;
        if (event.done && filterMode !== "all") return false;
        const countdown = event.date
          ? getCountdownDetails(event.date)
          : null;
        if (filterMode === "overdue") return countdown?.urgency === "overdue";
        if (filterMode === "upcoming") return countdown?.urgency !== "overdue";
        return true;
      }),
    [allEvents, filterMode]
  );

  const remindersByDate = useMemo(() => {
    const map = new Map();
    filteredEvents.forEach((event) => {
      const date = parseLocalDate(event.date);
      if (!date) return;
      const key = dateKey(date);
      map.set(key, [...(map.get(key) || []), event]);
    });
    return map;
  }, [filteredEvents]);

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
      [...filteredEvents]
        .filter((event) => event.date)
        .sort(
          (first, second) =>
            new Date(first.date).getTime() - new Date(second.date).getTime()
        )
        .slice(0, 5),
    [filteredEvents]
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
                          getCountdownDetails(reminder.date || reminder.remind_on)?.urgency === "overdue";
                        return (
                          <span
                            key={reminder.id}
                            className={`w-full truncate rounded px-1.5 py-0.5 text-left text-[9px] font-bold leading-tight sm:text-[10px] ${
                              reminder.done
                                ? "bg-slate-100 text-slate-400 line-through"
                                : overdue
                                  ? "bg-rose-100 text-rose-800"
                                  : reminder.isReminder
                                    ? "bg-purple-50 text-purple-800 border border-purple-100"
                                    : "bg-sky-50 text-sky-800 border border-sky-100"
                            }`}
                          >
                            {reminder.label || reminder.note || reminder.deadline_ref || "Deadline"}
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
                  No scheduled deadlines for this date. Click on any active date cell to inspect milestones.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedReminders.map((reminder) => {
                    const notice = noticesMap[reminder.notice_id];
                    const countdown = getCountdownDetails(reminder.date || reminder.remind_on);
                    return (
                      <article key={reminder.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              reminder.done
                                ? "bg-slate-200 text-slate-600"
                                : countdown?.urgency === "overdue"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-purple-100 text-purple-800"
                            }`}>
                              {reminder.done ? "Completed" : countdown?.label || "Upcoming"}
                            </span>
                            {reminder.isReminder ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                Saved Reminder
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                                {reminder.date_type === "calculated" ? "Calculated Deadline" : "Notice Deadline"}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {formatDate(reminder.date || reminder.remind_on)}
                          </span>
                        </div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-navy-950 leading-snug">
                          {reminder.label || reminder.note || reminder.deadline_ref || "Official deadline"}
                        </h3>
                        {notice && (
                          <p className="text-xs text-slate-500 font-medium">
                            From: <span className="font-bold text-navy-950">{notice.title}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                          <div className="flex items-center gap-2">
                            <AddToCalendarButton
                              title={reminder.label || reminder.note || reminder.deadline_ref || "Notice deadline"}
                              description={notice ? `Deadline from notice: ${notice.title}` : ""}
                              dateStr={reminder.date || reminder.remind_on}
                              noticeId={reminder.notice_id}
                            />
                            {!reminder.isReminder && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReminderModal({
                                    isOpen: true,
                                    noticeId: reminder.notice_id,
                                    deadline: reminder.deadline_item,
                                    noticeDate: notice?.notice_date,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 px-2 py-1 rounded-lg border border-purple-200 bg-white hover:bg-purple-50 transition min-h-[32px]"
                              >
                                <Bell className="w-3.5 h-3.5 text-purple-700" />
                                <span>Set reminder</span>
                              </button>
                            )}
                          </div>
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

            {/* As Soon As Possible Notices (Action needed without fixed calendar date) */}
            {asapNotices.length > 0 && (
              <section className="surface-card p-5 sm:p-6 space-y-3" aria-labelledby="asap-notices-title">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <h2 id="asap-notices-title" className="text-sm font-extrabold text-navy-950">
                    Action Needed: As Soon As Possible
                  </h2>
                </div>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  These notices require action at the earliest without a fixed calendar due date.
                </p>
                <div className="space-y-3">
                  {asapNotices.map(({ notice, deadline, noticeDate }) => (
                    <article key={notice.id} className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/70 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-600 text-white">
                          As Soon As Possible
                        </span>
                        {noticeDate && (
                          <span className="text-[11px] font-semibold text-slate-600">
                            Notice date: {formatDate(noticeDate)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm font-extrabold text-navy-950 leading-snug">
                        {deadline?.label || "Complete notice process"}
                      </h3>
                      <p className="text-xs text-slate-600 font-medium">
                        From: <span className="font-bold text-navy-950">{notice.title}</span>
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-200/60">
                        <button
                          type="button"
                          onClick={() =>
                            setReminderModal({
                              isOpen: true,
                              noticeId: notice.id,
                              deadline,
                              noticeDate,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition min-h-[32px]"
                        >
                          <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Set my own reminder date</span>
                        </button>
                        <Link
                          to={`/notices/${notice.id}`}
                          className="text-xs font-bold text-purple-700 hover:text-purple-900 transition"
                        >
                          Open notice →
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

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
                          {reminder.label || reminder.note || reminder.deadline_ref || "Notice deadline"}
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
                        {formatDate(reminder.date || reminder.remind_on)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      {/* Reminder Modal for setting reminders directly from the calendar */}
      {reminderModal.isOpen && (
        <ReminderModal
          noticeId={reminderModal.noticeId}
          deadline={reminderModal.deadline}
          noticeDate={reminderModal.noticeDate}
          isOpen={reminderModal.isOpen}
          onClose={() => setReminderModal({ isOpen: false, noticeId: null, deadline: null, noticeDate: null })}
          onReminderCreated={loadCalendarData}
        />
      )}
    </main>
  );
}
