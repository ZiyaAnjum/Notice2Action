import { useEffect, useState } from "react";
import { Bell, X, Calendar, Loader2, AlertCircle } from "lucide-react";
import { createReminder } from "../api/client";

export function ReminderModal({ noticeId, deadline, isOpen, onClose, onReminderCreated }) {
  const [remindOn, setRemindOn] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    const deadlineDesc = deadline?.description || deadline?.original_wording || "Notice deadline";
    setNote(`Reminder: ${deadlineDesc}`);

    // Compute default reminder date: 3 days before deadline, or today
    let defaultDate = new Date();
    if (deadline?.iso_date) {
      const d = new Date(deadline.iso_date);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() - 3);
        // Only use if not past today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (d >= today) {
          defaultDate = d;
        } else {
          defaultDate = new Date();
        }
      }
    }
    const isoString = defaultDate.toISOString().split("T")[0];
    setRemindOn(isoString);
  }, [isOpen, deadline]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!remindOn) {
      setError("Please choose a date for the reminder.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await createReminder(noticeId, {
        deadline_ref: deadline?.description || deadline?.original_wording || "Official Deadline",
        remind_on: remindOn,
        note: note.trim() || null,
      });
      if (onReminderCreated) {
        onReminderCreated(created);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create reminder. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-md w-full border-2 border-slate-300 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-700" aria-hidden="true" />
            <h2 id="reminder-modal-title" className="text-lg font-bold text-slate-900">
              Set Deadline Reminder
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-600"
            aria-label="Close reminder dialog"
          >
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Associated Deadline
            </span>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800">
              <p>{deadline?.description || "Notice Deadline"}</p>
              {deadline?.iso_date && (
                <p className="text-xs font-normal text-slate-500 mt-1">
                  Due date: {deadline.iso_date}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="remind_on_input" className="block text-sm font-bold text-slate-800 mb-1">
              Reminder Date <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                id="remind_on_input"
                type="date"
                required
                value={remindOn}
                onChange={(e) => setRemindOn(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 text-sm font-medium min-h-[44px]"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              We default to a few days before the notice deadline.
            </p>
          </div>

          <div>
            <label htmlFor="note_input" className="block text-sm font-bold text-slate-800 mb-1">
              Reminder Note (Optional)
            </label>
            <input
              id="note_input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Gather documents and submit online"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 text-sm min-h-[44px]"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl font-bold text-slate-700 hover:bg-slate-100 border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 shadow-sm disabled:opacity-50 min-h-[44px]"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? "Saving..." : "Save Reminder"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
