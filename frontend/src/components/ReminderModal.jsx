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
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-950/60 backdrop-blur-xs"
  >
          <div className="bg-white border border-stone-200/90 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-elevated space-y-6">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
                  <Bell className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="reminder-modal-title" className="text-lg font-black text-stone-950">
                    Set Deadline Reminder
                  </h2>
                  <span className="text-xs text-stone-500 font-medium">
                    Keep on top of this requirement
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-coral-50 border border-coral-300 text-coral-950 text-xs sm:text-sm flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-coral-600 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-1.5">
                        <label htmlFor="remind-on-input" className="block text-xs font-bold text-stone-700">
                          Reminder Date <span className="text-coral-600">*</span>
                        </label>
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="remind-on-input"
                            type="date"
                            required
                            value={remindOn}
                            onChange={(e) => setRemindOn(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                          />
                        </div>
                      </div>

                          <div className="space-y-1.5">
                            <label htmlFor="reminder-note-input" className="block text-xs font-bold text-stone-700">
                              Note / Description
                            </label>
            <textarea
                              id="reminder-note-input"
                              rows={3}
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="e.g., Submit form at department office with ID proof"
                              className="w-full p-3 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                            />
                          </div>

                            <div className="pt-2 flex justify-end gap-2.5">
                              <button
                                type="button"
                                disabled={loading}
                                onClick={onClose}
                                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-stone-600 bg-white border border-stone-300 hover:bg-stone-50 min-h-[40px]"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 min-h-[40px] shadow-xs"
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
