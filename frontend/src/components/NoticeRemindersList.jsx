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
      setEditingId(null);
    } catch (err) {
      alert(err.message || "Failed to update reminder.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section
      className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-4"
      aria-labelledby="notice-reminders-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-indigo-700" aria-hidden="true" />
          <h2 id="notice-reminders-heading" className="text-xl font-extrabold text-slate-950 tracking-tight">
            Reminders for this Notice
          </h2>
        </div>
        <span className="text-xs font-bold bg-indigo-50 text-indigo-800 px-3 py-1 rounded-full">
          {reminders.length} Active
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
                className="p-4 rounded-xl border-2 border-indigo-400 bg-indigo-50/50 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Reminder Date
                    </label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Note
                    </label>
                    <input
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Reminder note"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit(rem.id)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
                  >
                    {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save</span>
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={rem.id}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                rem.done
                  ? "bg-slate-100/80 border-slate-200 opacity-75"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-start gap-3 flex-1">
                <button
                  type="button"
                  onClick={() => handleToggleDone(rem)}
                  disabled={isSaving}
                  aria-label={rem.done ? "Mark reminder undone" : "Mark reminder completed"}
                  className="mt-0.5 text-slate-400 hover:text-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 rounded-md p-0.5"
                >
                  {rem.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-400" />
                  )}
                </button>
                <div className="space-y-0.5">
                  <p
                    className={`text-sm sm:text-base font-bold ${
                      rem.done ? "line-through text-slate-500" : "text-slate-900"
                    }`}
                  >
                    {rem.note || rem.deadline_ref || "Notice Reminder"}
                  </p>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Scheduled for: {formatDate(rem.remind_on)}</span>
                    {rem.deadline_ref && rem.note && (
                      <span className="text-slate-400">• For: {rem.deadline_ref}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => startEdit(rem)}
                  disabled={isSaving}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-600"
                  aria-label="Edit reminder"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(rem.id)}
                  disabled={isSaving}
                  className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 focus:outline-hidden focus:ring-2 focus:ring-rose-600"
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
