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
import { formatDate } from "../utils/text";

export function RemindersPage() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState("all"); // "all", "pending", "completed"

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
    try {
      const updated = await updateReminder(rem.id, { done: !rem.done });
      setReminders((prev) =>
        prev.map((item) => (item.id === rem.id ? updated : item))
      );
    } catch (err) {
      alert(err.message || "Could not update reminder status.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this reminder?")) return;
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err.message || "Failed to delete reminder.");
    }
  };

  const filtered = useMemo(() => {
    return reminders.filter((r) => {
      if (filterMode === "pending") return !r.done;
      if (filterMode === "completed") return r.done;
      return true;
    });
  }, [reminders, filterMode]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
              <Bell className="w-5 h-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
              Action Reminders Tracker
            </h1>
          </div>
          <p className="text-stone-600 text-sm mt-1 font-medium">
            Manage institutional notification triggers and track execution of notice action steps.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-stone-400 mr-1" />
          {[
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "completed", label: "Completed" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterMode(tab.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[36px] ${
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

      {!loading && !error && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-stone-200 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-stone-300 mx-auto" />
              <h2 className="font-extrabold text-stone-900 text-lg">No Reminders Found</h2>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                No reminders match the selected filter. Reminders can be created on any notice dashboard.
              </p>
              <Link
                to="/notices"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-teal-600 hover:bg-teal-700 shadow-xs"
              >
                Browse Notices
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((rem) => (
                <div
                  key={rem.id}
                  className={`bg-white rounded-2xl p-4 border shadow-card flex items-start justify-between gap-3 transition-all ${
                    rem.done
                      ? "border-stone-200 opacity-60 bg-stone-50/50"
                      : "border-stone-200/90 hover:border-teal-400"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(rem)}
                      aria-label={rem.done ? "Mark incomplete" : "Mark completed"}
                      className="mt-0.5 text-stone-400 hover:text-teal-600 focus:outline-hidden focus:ring-2 focus:ring-teal-600 rounded p-0.5"
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
                      {rem.notice_id && (
                        <Link
                          to={`/notices/${rem.notice_id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 underline mt-1"
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
                    className="p-1.5 text-stone-400 hover:text-coral-600 hover:bg-coral-50 rounded-lg transition-colors"
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
    </div>
  );
}

