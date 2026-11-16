import { useState } from "react";
import { Bell, CheckCircle2, Circle, Trash2, Edit2, Loader2, Calendar } from "lucide-react";
import { updateReminder, deleteReminder } from "../api/client";
import { formatDate } from "../utils/text";

export function NoticeRemindersList({ reminders = [], onReminderUpdated, onReminderDeleted }) {
  const [editingId, setEditingId] = useState(null);
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [savingId, setSavingId] = useState(null);

  if (!reminders || reminders.length === 0) {
    return null;
  }

  const handleToggleDone = async (reminder) => {
    setSavingId(reminder.id);
    try {
      const updated = await updateReminder(reminder.id, { done: !reminder.done });
      if (onReminderUpdated) onReminderUpdated(updated);
    } catch (err) {
      alert(err.message || "Could not update reminder status.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (reminderId) => {
    if (!window.confirm("Are you sure you want to delete this reminder?")) return;
    setSavingId(reminderId);
    try {
      await deleteReminder(reminderId);
      if (onReminderDeleted) onReminderDeleted(reminderId);
    } catch (err) {
      alert(err.message || "Could not delete reminder.");
    } finally {
      setSavingId(null);
    }
  };

  const startEdit = (reminder) => {
    setEditingId(reminder.id);
    setEditNote(reminder.note || "");
    setEditDate(reminder.remind_on ? reminder.remind_on.split("T")[0] : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNote("");
    setEditDate("");
  };

  const saveEdit = async (reminderId) => {
    if (!editDate) {
      alert("Please specify a reminder date.");
      return;
    }
    setSavingId(reminderId);
    try {
      const updated = await updateReminder(reminderId, {
        note: editNote.trim() || null,
        remind_on: editDate,
      });
      if (onReminderUpdated) onReminderUpdated(updated);
      cancelEdit();
    } catch (err) {
      alert(err.message || "Failed to update reminder.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section
      className="bg-white border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-card space-y-5"
      aria-labelledby="notice-reminders-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-stone-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <Bell className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 block">
              Follow-Up Actions
            </span>
            <h2 id="notice-reminders-heading" className="text-xl font-black text-stone-950 tracking-tight">
              Scheduled Reminders for this Notice
            </h2>
          </div>
        </div>
        <span className="text-xs font-extrabold bg-stone-100 text-stone-800 px-3 py-1 rounded-full border border-stone-200">
          {reminders.filter((r) => !r.done).length} Pending
        </span>
      </div>

      <div className="space-y-3">
        {reminders.map((rem) => {
          const isEditing = editingId === rem.id;
          const isSaving = savingId === rem.id;

          if (isEditing) {
            return (
              <div
                key={rem.id}
                className="p-4 rounded-2xl bg-stone-50 border border-teal-300 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-stone-700">Reminder Note</label>
                    <input
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Note details..."
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-stone-300 rounded-xl text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700">Remind On Date</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-stone-300 rounded-xl text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={cancelEdit}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-stone-600 bg-white border border-stone-300 hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => saveEdit(rem.id)}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={rem.id}
              className={`p-4 rounded-2xl border transition-colors flex items-start justify-between gap-3 ${
                rem.done
                  ? "bg-stone-50/50 border-stone-200 opacity-60"
                  : "bg-white border-stone-200/90 hover:border-teal-300"
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleToggleDone(rem)}
                  aria-label={rem.done ? "Mark reminder undone" : "Mark reminder done"}
                  className="mt-0.5 text-stone-400 hover:text-teal-600 focus:outline-hidden focus:ring-2 focus:ring-teal-600 rounded p-0.5"
                >
                  {isSaving ? (
                    <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                  ) : rem.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-stone-400" />
                  )}
                </button>

                <div className="space-y-0.5 min-w-0">
                  <p
                    className={`text-sm font-extrabold leading-snug ${
                      rem.done ? "line-through text-stone-400" : "text-stone-900"
                    }`}
                  >
                    {rem.note || rem.deadline_ref || "Notice reminder"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-stone-500 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-stone-400" />
                    <span>Scheduled for: {formatDate(rem.remind_on)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(rem)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-teal-700 hover:bg-teal-50"
                  aria-label="Edit reminder"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(rem.id)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-coral-600 hover:bg-coral-50"
                  aria-label="Delete reminder"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
