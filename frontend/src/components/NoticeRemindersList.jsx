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
      className="surface-card p-6 sm:p-8 space-y-5"
      aria-labelledby="notice-reminders-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
            <Bell className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
              Follow-Up Actions
            </span>
            <h2 id="notice-reminders-heading" className="text-lg sm:text-xl font-extrabold text-navy-950 tracking-tight">
              Scheduled Reminders for this Notice
            </h2>
          </div>
        </div>
        <span className="text-xs font-bold bg-purple-50 text-purple-800 px-3 py-1 rounded-full border border-purple-200">
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
                className="p-4 rounded-2xl bg-purple-50/40 border border-purple-200 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-700">Reminder Note</label>
                    <input
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Note details..."
                      className="focus-ring w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl text-navy-950 focus:border-purple-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Remind On Date</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="focus-ring w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl text-navy-950 focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={cancelEdit}
                    className="focus-ring px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => saveEdit(rem.id)}
                    className="focus-ring px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 disabled:opacity-50 shadow-xs"
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
              className={`p-4 rounded-2xl border transition flex items-start justify-between gap-3 ${
                rem.done
                  ? "bg-slate-50/60 border-slate-200 opacity-60"
                  : "bg-white border-slate-200 hover:border-purple-300 shadow-xs"
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleToggleDone(rem)}
                  aria-label={rem.done ? "Mark reminder undone" : "Mark reminder done"}
                  className="focus-ring mt-0.5 text-slate-400 hover:text-purple-700 rounded p-0.5 transition"
                >
                  {isSaving ? (
                    <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                  ) : rem.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300" />
                  )}
                </button>

                <div className="space-y-0.5 min-w-0">
                  <p
                    className={`text-xs sm:text-sm font-extrabold leading-snug ${
                      rem.done ? "line-through text-slate-400" : "text-navy-950"
                    }`}
                  >
                    {rem.note || rem.deadline_ref || "Notice reminder"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Scheduled for: {formatDate(rem.remind_on)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(rem)}
                  className="focus-ring p-1.5 rounded-lg text-slate-400 hover:text-purple-700 hover:bg-purple-50 transition"
                  aria-label="Edit reminder"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(rem.id)}
                  className="focus-ring p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
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
