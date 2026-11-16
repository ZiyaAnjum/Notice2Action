import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  Search,
  Filter,
} from "lucide-react";
import { listNotices, getUpcomingReminders, deleteNotice, updateReminder } from "../api/client";
import { getCategoryLabel } from "../utils/categories";
import { formatDate } from "../utils/text";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";

export function NoticesListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [notices, setNotices] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

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

  // Filter and search notices
  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesTitle = (n.title || "").toLowerCase().includes(query);
        const matchesCategory = (n.category || "").toLowerCase().includes(query);
        const matchesDeadline = (n.deadline_summary || "").toLowerCase().includes(query);
        if (!matchesTitle && !matchesCategory && !matchesDeadline) return false;
      }
      // Category filter
      if (selectedCategory !== "all" && n.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (selectedStatus !== "all") {
        if (selectedStatus === "needs_verification" && !n.needs_verification) return false;
        if (selectedStatus !== "needs_verification" && n.status !== selectedStatus) return false;
      }
      return true;
    });
  }, [notices, searchTerm, selectedCategory, selectedStatus]);

  return (
      <main className="space-y-6 sm:space-y-8">
        {/* Header & Quick Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
            <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
                    <FileText className="w-5 h-5" />
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                    Your Past Notices
                  </h1>
                </div>
                <p className="text-stone-600 text-sm mt-1 font-medium">
                  Review your notices, check deadline dates, and track completion progress.
                </p>
            </div>
            <Link
              to="/upload"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-teal-600 hover:bg-teal-700 shadow-xs focus:outline-hidden focus:ring-2 focus:ring-teal-600 min-h-[44px]"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Upload New Notice</span>
            </Link>
          </div>

          {loading && (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-stone-600">
                <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
                <p className="font-bold text-sm">Loading your notices...</p>
              </div>
      )}

              {error && !loading && (
                  <div className="p-5 sm:p-6 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-3 shadow-xs">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-extrabold text-base">Could not load notices</p>
                        <p className="text-sm font-medium">{error}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={fetchData}
                      className="px-4 py-2 rounded-xl font-bold bg-amber-800 text-white hover:bg-amber-900 text-xs transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
      )}

                  {!loading && !error && (
        <>
                      {/* Upcoming Reminders Section (Next 14 Days) */}
                      <section
                        className="bg-white border border-stone-200/90 rounded-3xl p-5 sm:p-6 shadow-card space-y-4"
                        aria-labelledby="upcoming-reminders-title"
                      >
                          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-stone-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
                                  <Bell className="w-4 h-4" aria-hidden="true" />
                                </div>
                                <h2 id="upcoming-reminders-title" className="text-base font-extrabold text-stone-950">
                                  Upcoming Reminders (Next 14 Days)
                                </h2>
                            </div>
                              <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-1 rounded-full">
                                {reminders.filter((r) => !r.done).length} Pending
                              </span>
                          </div>

                          {reminders.length === 0 ? (
                              <p className="text-xs sm:text-sm text-stone-500 font-medium py-2">
                                No upcoming reminders scheduled for the next 14 days.
                              </p>
                              ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {reminders.map((rem) => (
                  <div
                    key={rem.id}
                    className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 transition-colors ${
                      rem.done
                        ? "bg-stone-50 border-stone-200 opacity-60"
                        : "bg-white border-stone-200/90 hover:border-teal-300"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleToggleReminder(rem)}
                        aria-label={rem.done ? "Mark undone" : "Mark reminder done"}
                        className="mt-0.5 text-stone-400 hover:text-teal-600 focus:outline-hidden focus:ring-2 focus:ring-teal-600 rounded-md p-0.5"
                      >
                        {rem.done ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-stone-400" />
                        )}
                      </button>
                      <div className="space-y-0.5 min-w-0">
                        <p
                          className={`text-xs sm:text-sm font-bold leading-snug ${
                            rem.done ? "line-through text-stone-400" : "text-stone-900"
                          }`}
                        >
                          {rem.note || rem.deadline_ref || "Notice reminder"}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-stone-400" />
                          <span>Due: {formatDate(rem.remind_on)}</span>
                        </div>
                      </div>
                    </div>

                              {rem.notice_id && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/notices/${rem.notice_id}`)}
                                  className="text-xs font-bold text-teal-700 hover:text-teal-900 underline self-center flex-shrink-0"
                                >
                                  View Notice
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
            )}
                      </section>

                      {/* Search & Filter Toolbar */}
                      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-card flex flex-col md:flex-row gap-3 items-center justify-between">
                        <div className="relative w-full md:w-72">
                          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Filter by title or keyword..."
                            className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                          />
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                          <Filter className="w-4 h-4 text-stone-400 flex-shrink-0" />
                          <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="text-xs font-bold text-stone-700 bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                          >
                            <option value="all">All Categories</option>
                            <option value="scholarship_or_college">Scholarships &amp; Academics</option>
                            <option value="bank">Banking &amp; Financial Services</option>
                            <option value="utility">Utility &amp; Energy Bills</option>
                            <option value="tax_or_payment">Taxation &amp; Statutory Demands</option>
                            <option value="government_scheme">Government &amp; Civic Schemes</option>
                            <option value="other_out_of_scope">Out of Scope Notices</option>
                          </select>

                          <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="text-xs font-bold text-stone-700 bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
                          >
                            <option value="all">All Statuses</option>
                            <option value="processed">Processed</option>
                            <option value="needs_verification">Requires Manual Check</option>
                            <option value="needs_clearer_document">Needs Clearer Scan</option>
                            <option value="out_of_scope">Out of Scope</option>
                          </select>
                        </div>
                      </div>

                      {/* Notices Grid */}
                      <section aria-labelledby="all-notices-title" className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 id="all-notices-title" className="text-lg sm:text-xl font-black text-stone-950">
                            All Notices ({filteredNotices.length})
                          </h2>
                          {filteredNotices.length !== notices.length && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchTerm("");
                                setSelectedCategory("all");
                                setSelectedStatus("all");
                              }}
                              className="text-xs text-teal-700 font-bold hover:underline"
                            >
                              Reset filters
                            </button>
                          )}
                        </div>

                        {notices.length === 0 ? (
                            <div className="bg-white border-2 border-dashed border-stone-300 rounded-3xl p-8 sm:p-14 text-center space-y-4">
                              <FileText className="w-12 h-12 text-stone-300 mx-auto" />
                              <div className="space-y-1">
                                  <h3 className="text-lg font-bold text-stone-900">No notices uploaded yet</h3>
                                  <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
                                    Upload your first official notice in PDF format to get an automated, evidence-backed action plan.
                                  </p>
                              </div>
                              <Link
                                to="/upload"
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs sm:text-sm text-white bg-teal-600 hover:bg-teal-700 shadow-xs min-h-[44px]"
                              >
                                <Upload className="w-4 h-4" />
                                <span>Upload Your First Notice</span>
                              </Link>
                            </div>
                            ) : filteredNotices.length === 0 ? (
                            <div className="bg-white rounded-2xl p-8 text-center border border-stone-200 text-stone-500 space-y-2">
                              <p className="text-sm font-bold text-stone-800">No notices match your search filters.</p>
                              <p className="text-xs">Try clearing your search term or selecting another category.</p>
                            </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                                  {filteredNotices.map((n) => {
                                    const categoryLabel = getCategoryLabel(n.category);
                                    const isProcessing = n.status === "processing";
                                    const isClearer = n.status === "needs_clearer_document";
                                    const isOutOfScope = n.status === "out_of_scope";
                                    const isFailed = n.status === "extraction_failed";

                                    return (
                                      <div
                                        key={n.id}
                                        className="bg-white border border-stone-200/90 hover:border-teal-400 rounded-3xl p-5 sm:p-6 shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between space-y-4"
                                      >
                                        <div className="space-y-3">
                                          {/* Status & Category row */}
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                              <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-stone-100 text-stone-800 border border-stone-200">
                                                {categoryLabel}
                                              </span>

                                              <div className="flex items-center gap-2">
                                                {n.needs_verification && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                                Needs Verification
                              </span>
                            )}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                isProcessing
                                  ? "bg-teal-100 text-teal-900 animate-pulse"
                                  : isClearer
                                  ? "bg-amber-100 text-amber-900"
                                  : isOutOfScope
                                  ? "bg-stone-200 text-stone-800"
                                  : isFailed
                                  ? "bg-coral-100 text-coral-900"
                                  : "bg-sage-100 text-sage-900"
                              }`}
                            >
                              {n.status}
                            </span>
                          </div>
                        </div>

                        {/* Title */}
                        <h3 className="text-base sm:text-lg font-black text-stone-950 leading-snug">
                          {n.title || "Official Notice"}
                        </h3>

                        {/* Deadline Summary */}
                        <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl flex items-center gap-2 text-xs sm:text-sm text-stone-800 font-semibold">
                          <Clock className="w-4 h-4 text-teal-600 flex-shrink-0" />
                          <span>{n.deadline_summary || "No deadline found in notice"}</span>
                        </div>

                        {/* Timestamp */}
                        <p className="text-[11px] text-stone-400 font-medium">
                          Uploaded: {formatDate(n.created_at)}
                        </p>
                      </div>

                      {/* Card Actions */}
                      <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(n)}
                          className="p-2 rounded-lg text-stone-400 hover:text-coral-600 hover:bg-coral-50 focus:outline-hidden focus:ring-2 focus:ring-coral-600 transition-colors"
                          aria-label={`Delete notice ${n.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/notices/${n.id}`)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-teal-50 text-teal-800 hover:bg-teal-600 hover:text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-teal-600 min-h-[40px]"
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
