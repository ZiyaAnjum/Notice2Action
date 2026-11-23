import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  Circle,
  Calendar,
  Loader2,
  AlertCircle,
  Trash2,
  ArrowRight,
  Filter,
  RefreshCw,
} from "lucide-react";
import { getUpcomingReminders, updateReminder, deleteReminder } from "../api/client";
import { formatDate, getCountdownDetails } from "../utils/text";
import { PageHeader } from "../components/PageHeader";

export function RemindersPage() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState("all");
  const [actionError, setActionError] = useState(null);

  const fetchReminders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUpcomingReminders(90);
      setReminders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load reminders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleToggle = async (rem) => {
    setActionError(null);
    try {
      const updated = await updateReminder(rem.id, { done: !rem.done });
      setReminders((prev) =>
        prev.map((item) => (item.id === rem.id ? updated : item))
      );
    } catch (err) {
      setActionError(err.message || "Could not update reminder status.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this reminder?")) return;
    setActionError(null);
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setActionError(err.message || "Failed to delete reminder.");
    }
  };

  const filtered = useMemo(() => {
    if (!Array.isArray(reminders)) return [];
    return reminders.filter((r) => {
      if (filterMode === "pending") return !r.done;
      if (filterMode === "upcoming") {
        const countdown = getCountdownDetails(r.remind_on);
        return !r.done && countdown && countdown.urgency !== "overdue";
      }
      if (filterMode === "completed") return r.done;
      if (filterMode === "overdue") {
        return !r.done && getCountdownDetails(r.remind_on)?.urgency === "overdue";
      }
      return true;
    });
  }, [reminders, filterMode]);

  return (
    <main className="page-shell space-y-6">
      <PageHeader
        icon={Bell}
        eyebrow="Personal Action Center"
        title="Action Reminders"
        description="Manage your deadline reminders and checklist items linked to official institutional notices. Track what is pending, upcoming, or completed."
        actions={
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter reminders">
            <Filter className="mr-1 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {[
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
              { key: "upcoming", label: "Upcoming" },
              { key: "overdue", label: "Overdue" },
              { key: "completed", label: "Completed" },
            ].map((tab) => (
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
        <div className="surface-card py-20 flex flex-col items-center justify-center gap-3 text-slate-600">
          <Loader2 className="w-9 h-9 animate-spin text-purple-600" />
          <p className="font-bold text-xs sm:text-sm">Loading action reminders…</p>
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="surface-card p-6 border-amber-300 bg-amber-50 text-amber-950 space-y-3 ui-fade-in text-center"
        >
          <div className="flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-700" />
            <h2 className="font-extrabold text-sm sm:text-base">Could not load reminders</h2>
          </div>
          <p className="text-xs text-amber-900 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={fetchReminders}
            className="btn-primary mt-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {actionError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800 ui-fade-in">
          {actionError}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="surface-card space-y-3 p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto" />
              <h2 className="font-extrabold text-navy-950 text-base sm:text-lg">No Reminders Found</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No reminders match the selected filter. You can set reminders from any notice detail page.
              </p>
              <Link
                to="/notices"
                className="btn-primary mt-2"
              >
                Browse Notices
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {filtered.map((rem) => (
                <div
                  key={rem.id}
                  className={`surface-card surface-card-hover flex items-start justify-between gap-3 p-4 sm:p-5 ${
                    rem.done
                      ? "opacity-60 bg-slate-50/50"
                      : "bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(rem)}
                      aria-label={rem.done ? "Mark incomplete" : "Mark completed"}
                      className="focus-ring mt-0.5 rounded p-0.5 text-slate-400 hover:text-purple-700 transition"
                    >
                      {rem.done ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300" />
                      )}
                    </button>
                    <div className="space-y-1.5 min-w-0">
                      <p
                        className={`text-xs sm:text-sm font-extrabold leading-snug ${
                          rem.done ? "line-through text-slate-400" : "text-navy-950"
                        }`}
                      >
                        {rem.note || rem.deadline_ref || "Notice Requirement"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Remind Date: {formatDate(rem.remind_on)}</span>
                      </div>
                      {!rem.done && (() => {
                        const countdown = getCountdownDetails(rem.remind_on);
                        return countdown ? (
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            countdown.urgency === "overdue"
                              ? "bg-rose-50 text-rose-800 border border-rose-200"
                              : countdown.urgency === "urgent" || countdown.urgency === "critical"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-purple-50 text-purple-800 border border-purple-200"
                          }`}>
                            {countdown.label}
                          </span>
                        ) : null;
                      })()}
                      {rem.notice_id && (
                        <div>
                          <Link
                            to={`/notices/${rem.notice_id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 transition"
                          >
                            <span>Notice Details</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(rem.id)}
                    className="focus-ring rounded-xl p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 shrink-0"
                    aria-label="Delete reminder"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
