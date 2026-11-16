import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  Clock,
  Loader2,
  AlertCircle,
  ArrowRight,
  Filter,
} from "lucide-react";
import { getUpcomingReminders, listNotices } from "../api/client";
import { formatDate, getCountdownDetails } from "../utils/text";
import { AddToCalendarButton } from "../components/AddToCalendarButton";

export function CalendarPage() {
  const [reminders, setReminders] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState("all"); // "all", "upcoming", "overdue", "completed"

  useEffect(() => {
    async function loadCalendarData() {
      setLoading(true);
      setError(null);
      try {
        const [rems, nots] = await Promise.all([
          getUpcomingReminders(90).catch(() => []),
          listNotices().catch(() => []),
        ]);
        setReminders(rems || []);
        setNotices(nots || []);
      } catch (err) {
        setError(err.message || "Failed to load calendar deadlines.");
      } finally {
        setLoading(false);
      }
    }
    loadCalendarData();
  }, []);

  const noticesMap = useMemo(() => {
    const map = {};
    notices.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, [notices]);

  const filteredReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (filterMode === "completed") return r.done;
      if (r.done && filterMode !== "all") return false;

      const countdown = r.remind_on ? getCountdownDetails(r.remind_on) : null;
      if (filterMode === "overdue") {
        return countdown?.urgency === "overdue";
      }
      if (filterMode === "upcoming") {
        return countdown?.urgency !== "overdue";
      }
      return true;
    });
  }, [reminders, filterMode]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
              <CalendarIcon className="w-5 h-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
              Institutional Calendar &amp; Deadlines
            </h1>
          </div>
          <p className="text-stone-600 text-sm mt-1 font-medium">
            Track all cutoffs, download RFC 5545 iCalendar files, or sync directly to Google Calendar.
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-4 h-4 text-stone-400 mr-1 flex-shrink-0" />
          {[
            { key: "all", label: "All Deadlines" },
            { key: "upcoming", label: "Upcoming" },
            { key: "overdue", label: "Overdue" },
            { key: "completed", label: "Completed" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterMode(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[36px] ${
                filterMode === tab.key
                  ? "bg-teal-600 text-white shadow-xs"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-stone-600">
          <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
          <p className="font-bold text-sm">Aggregating deadlines across institutional notices...</p>
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-700" />
            <h2 className="font-extrabold text-sm">Could not load deadlines</h2>
          </div>
          <p className="text-xs text-amber-900">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {filteredReminders.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-stone-200 space-y-3">
              <Clock className="w-12 h-12 text-stone-300 mx-auto" />
              <h2 className="font-extrabold text-stone-900 text-lg">No Deadlines Found</h2>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                No deadlines match the current filter. Upload an official notice to extract deadlines automatically.
              </p>
              <Link
                to="/upload"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-teal-600 hover:bg-teal-700 shadow-xs"
              >
                Upload Notice
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReminders.map((rem) => {
                const notice = noticesMap[rem.notice_id];
                const countdown = rem.remind_on ? getCountdownDetails(rem.remind_on) : null;
                const isOverdue = countdown?.urgency === "overdue";

                return (
                  <div
                    key={rem.id}
                    className={`bg-white rounded-2xl p-5 border shadow-card flex flex-col justify-between gap-4 transition-all ${
                      rem.done
                        ? "border-stone-200 opacity-60"
                        : isOverdue
                        ? "border-coral-300 bg-coral-50/20"
                        : "border-stone-200/90 hover:border-teal-400"
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {countdown && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                              isOverdue
                                ? "bg-coral-100 text-coral-900 border border-coral-300"
                                : "bg-teal-50 text-teal-900 border border-teal-200"
                            }`}
                          >
                            {countdown.label}
                          </span>
                        )}
                        <span className="text-xs font-mono font-bold text-stone-700">
                          {formatDate(rem.remind_on)}
                        </span>
                      </div>

                      <h3 className="font-extrabold text-base text-stone-950 leading-snug">
                        {rem.note || rem.deadline_ref || "Official Deadline"}
                      </h3>

                      {notice && (
                        <p className="text-xs text-stone-500 font-medium">
                          From: <span className="text-stone-800 font-bold">{notice.title}</span>
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2 flex-wrap">
                      <AddToCalendarButton
                        title={rem.note || rem.deadline_ref || "Notice Deadline"}
                        description={notice ? `Deadline from notice: ${notice.title}` : ""}
                        dateStr={rem.remind_on}
                        noticeId={rem.notice_id}
                      />

                      {rem.notice_id && (
                        <Link
                          to={`/notices/${rem.notice_id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
                        >
                          <span>Open Notice</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

