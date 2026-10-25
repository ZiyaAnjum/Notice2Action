import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  AlertTriangle,
  Upload,
  Loader2,
  FileText,
  Building,
  RefreshCw,
  ExternalLink,
  CheckCircle,
} from "lucide-react";
import { getNotice, updateChecklistItem, getNoticeFileUrl } from "../api/client";
import { getCategoryLabel, SUPPORTED_CATEGORIES } from "../utils/categories";
import { DeadlineCard } from "../components/DeadlineCard";
import { SummaryQuestions } from "../components/SummaryQuestions";
import { ActionStepList } from "../components/ActionStepList";
import { DocumentChecklist } from "../components/DocumentChecklist";
import { PenaltiesAndWarnings } from "../components/PenaltiesAndWarnings";
import { NoticeRemindersList } from "../components/NoticeRemindersList";
import { SourceViewerModal } from "../components/SourceViewerModal";
import { ReminderModal } from "../components/ReminderModal";
import { UncertainBadge } from "../components/UncertainBadge";

export function NoticeDashboardPage() {
  const { id } = useParams();

  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Checklist state for optimistic update and rollback
  const [checklistMap, setChecklistMap] = useState({});
  const [checklistError, setChecklistError] = useState(null);

  // Reminders state
  const [reminders, setReminders] = useState([]);

  // Modals state
  const [sourceModal, setSourceModal] = useState({
    isOpen: false,
    page: null,
    quote: null,
  });
  const [reminderModal, setReminderModal] = useState({
    isOpen: false,
    deadline: null,
  });

  const pollIntervalRef = useRef(null);

  const fetchNoticeData = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getNotice(id);
      setNotice(data);

      // Build checklist map from backend data
      const initialMap = {};
      if (Array.isArray(data.checklist)) {
        data.checklist.forEach((item) => {
          initialMap[item.item_key] = item.status;
        });
      }
      setChecklistMap(initialMap);

      // Set reminders
      setReminders(data.reminders || []);

      // If processing, keep polling until final status
      if (data.status === "processing") {
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(async () => {
            try {
              const refreshed = await getNotice(id);
              if (refreshed.status !== "processing") {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
                setNotice(refreshed);
                setReminders(refreshed.reminders || []);
              }
            } catch {
              // ignore transient error
            }
          }, 2000);
        }
      } else {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (err) {
      setFetchError(err.message || "Failed to load notice details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchNoticeData();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchNoticeData]);

  // Handle checklist update with optimistic update and rollback
  const handleChecklistStatusChange = async (itemKey, newStatus) => {
    setChecklistError(null);
    const previousMap = { ...checklistMap };

    // 1. Optimistic update
    setChecklistMap((prev) => ({
      ...prev,
      [itemKey]: newStatus,
    }));

    // 2. Call backend
    try {
      await updateChecklistItem(id, itemKey, newStatus);
    } catch (err) {
      // 3. Rollback on failure
      setChecklistMap(previousMap);
      setChecklistError(
        `Failed to update checklist item: ${err.message || "Network error"}. Previous status restored.`
      );
    }
  };

  const handleOpenSource = (page, quote) => {
    setSourceModal({
      isOpen: true,
      page,
      quote,
    });
  };

  const handleOpenReminder = (deadline) => {
    setReminderModal({
      isOpen: true,
      deadline,
    });
  };

  const handleReminderCreated = (newReminder) => {
    setReminders((prev) => [...prev, newReminder]);
  };

  const handleReminderUpdated = (updated) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    );
  };

  const handleReminderDeleted = (deletedId) => {
    setReminders((prev) => prev.filter((r) => r.id !== deletedId));
  };

  // -------------------------------------------------------------
  // Render Loading & Initial Fetch Error
  // -------------------------------------------------------------
  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto" />
        <h1 className="text-xl font-bold text-slate-800">Loading notice dashboard...</h1>
      </main>
    );
  }

  if (fetchError || !notice) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="p-6 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-3">
          <h1 className="text-xl font-extrabold">Notice not available</h1>
          <p className="text-sm font-medium">{fetchError || "The requested notice could not be found."}</p>
          <div className="pt-2">
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 min-h-[44px]"
            >
              Back to Past Notices
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // Pre-result Status Handling
  // -------------------------------------------------------------

  // 1. Processing
  if (notice.status === "processing") {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="p-8 sm:p-12 bg-white border-2 border-indigo-200 rounded-3xl shadow-sm space-y-4">
          <Loader2 className="w-14 h-14 text-indigo-600 animate-spin mx-auto" />
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950">
            Reading and Analyzing Your Notice
          </h1>
          <p className="text-base text-slate-600 max-w-md mx-auto">
            Our AI service is reviewing the document to extract deadlines, actions, and requirements. This screen will update automatically.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={fetchNoticeData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 2. needs_clearer_document
  if (notice.status === "needs_clearer_document") {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div
          role="alert"
          className="bg-white border-2 border-amber-400 rounded-3xl p-6 sm:p-10 shadow-sm space-y-5"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-800">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950">
              Clearer Document Needed
            </h1>
            <p className="text-base text-slate-700 leading-relaxed font-medium">
              We could not read the text in this document clearly. The uploaded PDF appears to be a scanned image, blurry, or missing digital text.
            </p>
            {notice.message && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-sm text-amber-900 font-mono">
                {notice.message}
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md min-h-[48px]"
            >
              <Upload className="w-5 h-5" />
              <span>Upload a Clearer File</span>
            </Link>
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[48px]"
            >
              <span>Back to Past Notices</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 3. out_of_scope
  if (notice.status === "out_of_scope") {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div
          role="alert"
          className="bg-white border-2 border-slate-300 rounded-3xl p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
            <FileText className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950">
              Notice Type Not Supported Yet
            </h1>
            <p className="text-base text-slate-700 leading-relaxed font-medium">
              This document does not match any of our supported official notice categories. Notice to Action is designed specifically for actionable official and legal communications.
            </p>
          </div>

          {/* Supported Categories List */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Supported Notice Categories:
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SUPPORTED_CATEGORIES.map((cat) => (
                <div
                  key={cat.key}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5"
                >
                  <p className="font-extrabold text-sm text-slate-900">{cat.label}</p>
                  <p className="text-xs text-slate-600 font-medium">{cat.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 min-h-[48px]"
            >
              <Upload className="w-5 h-5" />
              <span>Upload Another Notice</span>
            </Link>
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[48px]"
            >
              <span>Back to Past Notices</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 4. extraction_failed or unconfigured AI service
  if (notice.status === "extraction_failed") {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div
          role="alert"
          className="bg-white border-2 border-rose-300 rounded-3xl p-6 sm:p-10 shadow-sm space-y-5"
        >
          <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-700">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950">
              Notice Extraction Could Not Complete
            </h1>
            <p className="text-base text-slate-700 font-medium">
              The AI service could not process this notice. This might happen if the file is corrupted, or if the AI service is currently unavailable.
            </p>
            {notice.message && (
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 text-sm text-rose-950 font-medium">
                {notice.message}
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 min-h-[48px]"
            >
              <Upload className="w-5 h-5" />
              <span>Try Uploading Again</span>
            </Link>
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[48px]"
            >
              <span>Back to Past Notices</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // Processed Status (Core Dashboard View, FR-08)
  // -------------------------------------------------------------
  const result = notice.result || {};

  // Title & Issuer
  const noticeTitle =
    result.notice_title?.value ||
    (typeof result.notice_title === "string" ? result.notice_title : null) ||
    notice.title ||
    notice.original_filename ||
    "Official Notice";
  const titleUncertain =
    result.notice_title?.status === "uncertain" || result.notice_title?.needs_verification;
  const titlePage = result.notice_title?.source_page || result.notice_title?.evidence?.page;
  const titleQuote = result.notice_title?.evidence_quote || result.notice_title?.evidence?.quote;

  const issuingOrg =
    result.issuing_organisation?.value ||
    (typeof result.issuing_organisation === "string" ? result.issuing_organisation : null) ||
    "Not stated in notice";
  const issuerUncertain =
    result.issuing_organisation?.status === "uncertain" ||
    result.issuing_organisation?.needs_verification;
  const issuerPage =
    result.issuing_organisation?.source_page || result.issuing_organisation?.evidence?.page;
  const issuerQuote =
    result.issuing_organisation?.evidence_quote || result.issuing_organisation?.evidence?.quote;

  const categoryLabel = getCategoryLabel(notice.category || result.category);
  const pdfFileUrl = getNoticeFileUrl(id);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Prominent Verification Alert Banner (if needs_verification is true) */}
      {notice.needs_verification && (
        <div
          role="alert"
          aria-live="polite"
          className="p-5 sm:p-6 bg-amber-50 border-3 border-amber-400 rounded-2xl shadow-sm flex items-start gap-3.5 text-amber-950"
        >
          <AlertTriangle className="w-7 h-7 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-black">
              Please check the highlighted items against your notice before acting
            </h2>
            <p className="text-sm sm:text-base font-medium text-amber-900 leading-relaxed">
              Certain claims, dates, or requirements in this notice could not be verified with complete confidence. Look for the amber &ldquo;Please verify&rdquo; badges throughout this page.
            </p>
          </div>
        </div>
      )}

      {/* Notice Header Card */}
      <section
        className="bg-white border-2 border-slate-300 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6"
        aria-labelledby="notice-header-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-100 text-indigo-900">
              {categoryLabel}
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
              Processed
            </span>
          </div>

          <a
            href={pdfFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[36px]"
          >
            <span>Original PDF</span>
            <ExternalLink className="w-4 h-4 text-slate-600" aria-hidden="true" />
          </a>
        </div>

        {/* Notice Title */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 id="notice-header-title" className="text-2xl sm:text-4xl font-black text-slate-950 tracking-tight leading-tight">
              {noticeTitle}
            </h1>
            {titleUncertain && <UncertainBadge />}
            {titlePage && (
              <button
                type="button"
                onClick={() => handleOpenSource(titlePage, titleQuote)}
                className="text-xs font-bold text-indigo-600 underline hover:text-indigo-800 self-center"
              >
                Source
              </button>
            )}
          </div>

          {/* Issuing Organisation */}
          <div className="flex flex-wrap items-center gap-2 pt-2 text-slate-700">
            <div className="p-1.5 bg-slate-100 rounded-lg text-slate-600">
              <Building className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Issuing Organisation:
            </span>
            <span className="text-base font-extrabold text-slate-900">{issuingOrg}</span>
            {issuerUncertain && <UncertainBadge />}
            {issuerPage && (
              <button
                type="button"
                onClick={() => handleOpenSource(issuerPage, issuerQuote)}
                className="text-xs font-bold text-indigo-600 underline hover:text-indigo-800"
              >
                Source
              </button>
            )}
          </div>
        </div>
      </section>

      {/* VISUALLY MOST PROMINENT: Deadlines Section */}
      <DeadlineCard
        deadlines={result.deadlines || []}
        onRemind={handleOpenReminder}
        onShowSource={handleOpenSource}
      />

      {/* Summary: 5 Plain Language Question Headings */}
      <SummaryQuestions summary={result.plain_language_summary || {}} />

      {/* Two-Column Grid: Action Plan & Documents Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-start">
        <ActionStepList
          steps={result.action_steps || []}
          submissionChannel={result.submission_channel}
          onShowSource={handleOpenSource}
        />

        <DocumentChecklist
          documents={result.required_documents || []}
          checklistMap={checklistMap}
          onStatusChange={handleChecklistStatusChange}
          onShowSource={handleOpenSource}
          errorMessage={checklistError}
        />
      </div>

      {/* Reminders List for this notice */}
      <NoticeRemindersList
        reminders={reminders}
        onReminderUpdated={handleReminderUpdated}
        onReminderDeleted={handleReminderDeleted}
      />

      {/* Penalties and Warnings Section */}
      <PenaltiesAndWarnings
        penalties={result.penalties || []}
        warnings={result.warnings || []}
        documentQuality={result.document_quality}
        onShowSource={handleOpenSource}
      />

      {/* Disclaimer */}
      <footer className="p-5 rounded-2xl bg-slate-100 border border-slate-300 text-center space-y-1 text-xs sm:text-sm text-slate-600">
        <p className="font-extrabold text-slate-800">
          This is a helper, not legal or financial advice. Always check the original notice.
        </p>
        <p>
          Notice to Action extracts claims directly from official text to assist you in timely action.
        </p>
      </footer>

      {/* Source Viewer Modal */}
      <SourceViewerModal
        noticeId={id}
        page={sourceModal.page}
        quote={sourceModal.quote}
        isOpen={sourceModal.isOpen}
        onClose={() => setSourceModal({ isOpen: false, page: null, quote: null })}
      />

      {/* Reminder Modal */}
      <ReminderModal
        noticeId={id}
        deadline={reminderModal.deadline}
        isOpen={reminderModal.isOpen}
        onClose={() => setReminderModal({ isOpen: false, deadline: null })}
        onReminderCreated={handleReminderCreated}
      />
    </main>
  );
}
