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
      const payload = {
        deadline_ref: deadline?.description || deadline?.label || "Notice deadline",
        remind_on: remindOn,
        note: note.trim() || null,
      };
      const created = await createReminder(noticeId, payload);
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-xs"
    >
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-elevated space-y-6 ui-fade-in">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <Bell className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="reminder-modal-title" className="text-lg font-extrabold text-navy-950">
                Set Deadline Reminder
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                Keep on top of this action item
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="remind-on-input" className="block text-xs font-bold text-slate-700">
              Reminder Date <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="remind-on-input"
                type="date"
                required
                value={remindOn}
                onChange={(e) => setRemindOn(e.target.value)}
                className="focus-ring w-full pl-10 pr-3 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-navy-950 focus:bg-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reminder-note-input" className="block text-xs font-bold text-slate-700">
              Note / Description
            </label>
            <textarea
              id="reminder-note-input"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Submit application form at department office with ID proof"
              className="focus-ring w-full p-3 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-navy-950 placeholder:text-slate-400 focus:bg-white"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="focus-ring px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 min-h-[42px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="focus-ring inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-purple-700 hover:bg-purple-800 disabled:opacity-50 min-h-[42px] shadow-purple transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? "Creating..." : "Save Reminder"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
