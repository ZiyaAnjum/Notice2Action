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
      setReminders(data || []);
    } catch (err) {
      setError(err.message || "Failed to load reminders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
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
    return reminders.filter((r) => {
      if (filterMode === "pending") return !r.done;
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
        eyebrow="Stay on top of next steps"
        title="Action reminders"
        description="Track saved reminder dates, review overdue items, and update completion status."
        actions={
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter reminders">
            <Filter className="mr-1 h-4 w-4 text-stone-400" aria-hidden="true" />
            {[
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
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
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-stone-600">
          <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
          <p className="font-bold text-sm">Loading action reminders...</p>
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-700" />
            <h2 className="font-extrabold text-sm">Could not load reminders</h2>
          </div>
          <p className="text-xs text-amber-900">{error}</p>
        </div>
      )}

      {actionError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {actionError}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="surface-card space-y-3 p-10 text-center">
              <CheckCircle2 className="w-12 h-12 text-stone-300 mx-auto" />
              <h2 className="font-extrabold text-stone-900 text-lg">No Reminders Found</h2>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                No reminders match the selected filter. Reminders can be created on any notice dashboard.
              </p>
              <Link
                to="/notices"
                className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-purple-800"
              >
                Browse Notices
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {filtered.map((rem) => (
                <div
                  key={rem.id}
                  className={`surface-card surface-card-hover flex items-start justify-between gap-3 p-4 ${
                    rem.done
                      ? "border-stone-200 opacity-60 bg-stone-50/50"
                      : "border-stone-200/90"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(rem)}
                      aria-label={rem.done ? "Mark incomplete" : "Mark completed"}
                      className="focus-ring mt-0.5 rounded p-0.5 text-stone-400 hover:text-purple-700"
                    >
                      {rem.done ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-stone-400" />
                      )}
                    </button>
                    <div className="space-y-1 min-w-0">
                      <p
                        className={`text-sm font-extrabold leading-snug ${
                          rem.done ? "line-through text-stone-400" : "text-stone-900"
                        }`}
                      >
                        {rem.note || rem.deadline_ref || "Notice Requirement"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-stone-500 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-stone-400" />
                        <span>Remind Date: {formatDate(rem.remind_on)}</span>
                      </div>
                      {!rem.done && (() => {
                        const countdown = getCountdownDetails(rem.remind_on);
                        return countdown ? (
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            countdown.urgency === "overdue"
                              ? "bg-rose-100 text-rose-800"
                              : countdown.urgency === "urgent" || countdown.urgency === "critical"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-purple-50 text-purple-800"
                          }`}>
                            {countdown.label}
                          </span>
                        ) : null;
                      })()}
                      {rem.notice_id && (
                        <Link
                          to={`/notices/${rem.notice_id}`}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 underline hover:text-purple-900"
                        >
                          <span>Notice Details</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(rem.id)}
                    className="focus-ring rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-coral-50 hover:text-coral-600"
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

