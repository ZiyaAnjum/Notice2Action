import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText,
  Upload,
  Calendar,
  AlertTriangle,
  Trash2,
  Bell,
  CheckCircle2,
  Circle,
  Loader2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { listNotices, getUpcomingReminders, deleteNotice, updateReminder } from "../api/client";
import { getCategoryLabel } from "../utils/categories";
import { formatDate } from "../utils/text";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";

export function NoticesListPage() {
  const navigate = useNavigate();

  const [notices, setNotices] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [noticeList, upcomingList] = await Promise.all([
        listNotices(),
        getUpcomingReminders(14).catch(() => []),
      ]);
      setNotices(noticeList || []);
      setReminders(upcomingList || []);
    } catch (err) {
      setError(err.message || "Could not load notices. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleReminder = async (rem) => {
    try {
      const updated = await updateReminder(rem.id, { done: !rem.done });
      setReminders((prev) =>
        prev.map((item) => (item.id === rem.id ? updated : item))
      );
    } catch (err) {
      alert(err.message || "Could not update reminder.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteNotice(deleteTarget.id);
      setNotices((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      alert(err.message || "Failed to delete notice.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tight">
            Your Past Notices
          </h1>
          <p className="text-slate-600 font-medium text-sm sm:text-base mt-1">
            Review your notices, check deadline dates, and track completion progress.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px]"
        >
          <Upload className="w-5 h-5" aria-hidden="true" />
          <span>Upload New Notice</span>
        </Link>
      </div>

      {loading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-600">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
          <p className="font-bold text-base">Loading your notices...</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-6 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-3">
          <p className="font-extrabold text-base">Could not load notices</p>
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="px-4 py-2 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 text-sm"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Upcoming Reminders Section */}
          <section
            className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-xs space-y-4"
            aria-labelledby="upcoming-reminders-title"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-700" aria-hidden="true" />
                <h2 id="upcoming-reminders-title" className="text-lg font-extrabold text-slate-950">
                  Upcoming Reminders (Next 14 Days)
                </h2>
              </div>
              <span className="text-xs font-bold text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-full">
                {reminders.filter((r) => !r.done).length} Pending
              </span>
            </div>

            {reminders.length === 0 ? (
              <p className="text-sm text-slate-500 font-medium">
                No upcoming reminders scheduled for the next 14 days.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {reminders.map((rem) => (
                  <div
                    key={rem.id}
                    className={`p-3.5 rounded-xl border-2 flex items-start justify-between gap-3 transition-colors ${
                      rem.done
                        ? "bg-slate-100 border-slate-200 opacity-70"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleReminder(rem)}
                        aria-label={rem.done ? "Mark undone" : "Mark reminder done"}
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
                          className={`text-sm font-bold ${
                            rem.done ? "line-through text-slate-500" : "text-slate-900"
                          }`}
                        >
                          {rem.note || rem.deadline_ref || "Notice reminder"}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Due: {formatDate(rem.remind_on)}</span>
                        </div>
                      </div>
                    </div>

                    {rem.notice_id && (
                      <button
                        type="button"
                        onClick={() => navigate(`/notices/${rem.notice_id}`)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline self-center"
                      >
                        View Notice
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Notices Grid */}
          <section aria-labelledby="all-notices-title" className="space-y-4">
            <h2 id="all-notices-title" className="text-xl font-extrabold text-slate-950">
              All Notices ({notices.length})
            </h2>

            {notices.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 sm:p-12 text-center space-y-4">
                <FileText className="w-12 h-12 text-slate-400 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-900">No notices uploaded yet</h3>
                  <p className="text-sm text-slate-600 max-w-md mx-auto">
                    Upload your first official notice in PDF format to get an automated, evidence-backed action plan.
                  </p>
                </div>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 min-h-[44px]"
                >
                  <Upload className="w-5 h-5" />
                  <span>Upload Your First Notice</span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {notices.map((n) => {
                  const categoryLabel = getCategoryLabel(n.category);
                  const isProcessing = n.status === "processing";
                  const isClearer = n.status === "needs_clearer_document";
                  const isOutOfScope = n.status === "out_of_scope";
                  const isFailed = n.status === "extraction_failed";

                  return (
                    <div
                      key={n.id}
                      className="bg-white border-2 border-slate-200 hover:border-indigo-400 rounded-2xl p-5 sm:p-6 shadow-xs transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        {/* Status & Category row */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                            {categoryLabel}
                          </span>

                          <div className="flex items-center gap-2">
                            {n.needs_verification && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                                Needs Verification
                              </span>
                            )}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                isProcessing
                                  ? "bg-indigo-100 text-indigo-900 animate-pulse"
                                  : isClearer
                                  ? "bg-amber-100 text-amber-900"
                                  : isOutOfScope
                                  ? "bg-slate-200 text-slate-800"
                                  : isFailed
                                  ? "bg-rose-100 text-rose-900"
                                  : "bg-emerald-100 text-emerald-900"
                              }`}
                            >
                              {n.status}
                            </span>
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="text-lg font-extrabold text-slate-950 leading-snug">
                          {n.title || "Official Notice"}
                        </h3>

                        {/* Deadline Summary */}
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-xs sm:text-sm text-slate-700 font-semibold">
                          <Clock className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                          <span>{n.deadline_summary || "No deadline found in notice"}</span>
                        </div>

                        {/* Timestamp */}
                        <p className="text-xs text-slate-400 font-medium">
                          Uploaded: {formatDate(n.created_at)}
                        </p>
                      </div>

                      {/* Card Actions */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(n)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus:outline-hidden focus:ring-2 focus:ring-rose-600"
                          aria-label={`Delete notice ${n.title}`}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/notices/${n.id}`)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px]"
                        >
                          <span>Open Dashboard</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        title={deleteTarget?.title}
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </main>
  );
}
