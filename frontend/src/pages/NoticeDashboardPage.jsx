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
import { getNoticeField } from "../utils/notices";
import { formatDate } from "../utils/text";

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
    setLoading(true);
    setFetchError(null);
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
                setChecklistMap(
                  Object.fromEntries(
                    (Array.isArray(refreshed.checklist) ? refreshed.checklist : []).map(
                      (item) => [item.item_key, item.status]
                    )
                  )
                );
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
    const timer = setTimeout(() => {
      setLoading(false);
    }, 8000);
    return () => {
      clearTimeout(timer);
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
      <main className="page-shell max-w-4xl space-y-4 py-16 text-center">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto" />
        <h1 className="text-lg font-bold text-navy-950">Loading notice details…</h1>
      </main>
    );
  }

  if (fetchError || !notice) {
    return (
      <main className="page-shell max-w-3xl space-y-6">
        <div className="surface-card p-6 sm:p-8 border-2 border-rose-300 text-rose-950 space-y-3 ui-fade-in">
          <h1 className="text-xl font-extrabold">Document Not Available</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium">
            {fetchError || "The requested notice document could not be found."}
          </p>
          <div className="pt-2">
            <Link
              to="/notices"
              className="btn-primary"
            >
              Back to Document Library
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
      <main className="page-shell max-w-3xl space-y-6 py-12 text-center">
        <div className="surface-card border-2 border-purple-300 p-8 sm:p-12 shadow-elevated space-y-4 ui-fade-in">
          <Loader2 className="w-14 h-14 text-purple-600 animate-spin mx-auto" />
          <h1 className="text-2xl sm:text-3xl font-black text-navy-950">
            Processing Your Notice
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            The AI engine is currently extracting available dates, requirements, and instructions from this document. This view will refresh automatically once completed.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={fetchNoticeData}
              className="btn-secondary"
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
      <main className="page-shell max-w-3xl space-y-6">
        <div
          role="alert"
          className="surface-card border-2 border-amber-300 p-6 sm:p-10 shadow-card space-y-5 ui-fade-in"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-800">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-navy-950">
              Clearer Document Needed
            </h1>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
              We could not read the text in this document clearly. Please upload a higher resolution copy or digital PDF.
            </p>
            {notice.message && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-mono">
                {notice.message}
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/upload"
              className="btn-primary"
            >
              <Upload className="w-4 h-4" />
              <span>Upload a Clearer File</span>
            </Link>
            <Link
              to="/notices"
              className="btn-secondary"
            >
              <span>Back to Library</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 3. out_of_scope
  if (notice.status === "out_of_scope") {
    return (
      <main className="page-shell max-w-3xl space-y-6">
        <div
          role="alert"
          className="surface-card border-2 border-slate-300 p-6 sm:p-10 shadow-card space-y-6 ui-fade-in"
        >
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
            <FileText className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-navy-950">
              Document Not Yet Classified
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
              The processing service could not match this document to a supported category, so an automated action plan is not yet available.
            </p>
          </div>

          {/* Supported Categories List */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Categories currently recognised by the processing service:
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SUPPORTED_CATEGORIES.map((cat) => (
                <div
                  key={cat.key}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5"
                >
                  <p className="font-extrabold text-xs text-navy-950">{cat.label}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{cat.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/upload"
              className="btn-primary"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Another Notice</span>
            </Link>
            <Link
              to="/notices"
              className="btn-secondary"
            >
              <span>Back to Library</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 4. extraction_failed
  if (notice.status === "extraction_failed") {
    return (
      <main className="page-shell max-w-3xl space-y-6">
        <div
          role="alert"
          className="surface-card border-2 border-rose-300 p-6 sm:p-10 shadow-card space-y-5 ui-fade-in"
        >
          <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-700">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-navy-950">
              Document Processing Could Not Complete
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              The connected analysis service could not process this document. This may occur if the file is password-protected or unreadable.
            </p>
            {notice.message && (
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-950 font-medium">
                {notice.message}
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/upload"
              className="btn-primary"
            >
              <Upload className="w-4 h-4" />
              <span>Try Uploading Again</span>
            </Link>
            <Link
              to="/notices"
              className="btn-secondary"
            >
              <span>Back to Library</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // Processed Status (Core Dashboard View)
  // -------------------------------------------------------------
  const result = notice.result || {};
  const technicalNotes = result.technical_notes || notice.technical_notes || [];

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
    getNoticeField(notice, [
      "source_organisation",
      "source_organization",
      "issuing_organisation",
      "issuing_organization",
      "issuer",
    ]) ||
    "Not stated in notice";
  const issuerUncertain =
    result.issuing_organisation?.status === "uncertain" ||
    result.issuing_organisation?.needs_verification;
  const issuerPage =
    result.issuing_organisation?.source_page || result.issuing_organisation?.evidence?.page;
  const issuerQuote =
    result.issuing_organisation?.evidence_quote || result.issuing_organisation?.evidence?.quote;
  const documentType = getNoticeField(notice, ["notice_type", "document_type", "type"]);
  const priority = getNoticeField(notice, ["priority", "priority_level", "urgency"]);
  const issueDate = getNoticeField(notice, ["issue_date", "issued_at"]);

  const categoryLabel = getCategoryLabel(notice.category || result.category);
  const pdfFileUrl = getNoticeFileUrl(id);

  return (
    <main className="page-shell max-w-6xl space-y-6 sm:space-y-8">
      {/* Prominent Verification Alert Banner */}
      {notice.needs_verification && (
        <div
          role="alert"
          aria-live="polite"
          className="p-5 sm:p-6 bg-amber-50 border-2 border-amber-300 rounded-3xl shadow-sm flex items-start gap-3.5 text-amber-950 ui-fade-in"
        >
          <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-black">
              Please check the highlighted items against your notice before acting
            </h2>
            <p className="text-xs sm:text-sm font-medium text-amber-900 leading-relaxed">
              Certain claims, dates, or requirements in this document could not be matched with 100% confidence. Look for amber &ldquo;Please verify&rdquo; badges throughout this page.
            </p>
          </div>
        </div>
      )}

      {/* Notice Header Card */}
      <section
        className="surface-card p-6 sm:p-8 space-y-6 shadow-card"
        aria-labelledby="notice-header-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
              {categoryLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              Processed
            </span>
          </div>

          <a
            href={pdfFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition"
          >
            <span>Original PDF</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          </a>
        </div>

        {/* Notice Title */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 id="notice-header-title" className="text-2xl sm:text-3xl font-black text-navy-950 tracking-tight leading-tight">
              {noticeTitle}
            </h1>
            {titleUncertain && <UncertainBadge />}
            {titlePage && (
              <button
                type="button"
                onClick={() => handleOpenSource(titlePage, titleQuote)}
                className="focus-ring text-xs font-bold text-purple-700 underline hover:text-purple-900 self-center"
              >
                Source
              </button>
            )}
          </div>

          {/* Issuing Organisation */}
          <div className="flex flex-wrap items-center gap-2 pt-2 text-slate-700">
            <div className="p-1.5 bg-purple-50 text-purple-700 rounded-lg border border-purple-100">
              <Building className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Source Authority:
            </span>
            <span className="text-sm font-extrabold text-navy-950">{issuingOrg}</span>
            {issuerUncertain && <UncertainBadge />}
            {issuerPage && (
              <button
                type="button"
                onClick={() => handleOpenSource(issuerPage, issuerQuote)}
                className="focus-ring text-xs font-bold text-purple-700 underline hover:text-purple-900"
              >
                Source
              </button>
            )}
          </div>

          <dl className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Notice Type</dt>
              <dd className="mt-0.5 text-xs font-semibold text-slate-700">{documentType || "Standard notice"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Priority Level</dt>
              <dd className="mt-0.5 text-xs font-semibold capitalize text-slate-700">{priority || "Normal"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Issue Date</dt>
              <dd className="mt-0.5 text-xs font-semibold text-slate-700">{issueDate ? formatDate(issueDate) : "Not listed"}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Assistive Grounding Ribbon */}
      <aside className="flex items-start gap-3 rounded-2xl border border-purple-100 bg-purple-50/50 p-4 text-xs leading-relaxed text-slate-700">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" aria-hidden="true" />
        <p>
          These details are extracted by AI from the uploaded notice. Compare important dates, instructions, and requirements with the original PDF before taking formal action.
        </p>
      </aside>

      {/* VISUALLY PROMINENT: Deadlines Section */}
      <DeadlineCard
        deadlines={result.deadlines || []}
        onRemind={handleOpenReminder}
        onShowSource={handleOpenSource}
        noticeTitle={noticeTitle}
        noticeId={id}
      />

      {/* Summary: 5 Plain Language Question Headings */}
      <SummaryQuestions summary={result.plain_language_summary || {}} />

      {/* Two-Column Grid: Action Plan & Documents Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
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

      {/* Collapsed Technical Details Section */}
      {technicalNotes && technicalNotes.length > 0 && (
        <section aria-labelledby="technical-details-heading" className="mt-2">
          <details className="group rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 text-slate-700 shadow-xs">
            <summary className="cursor-pointer font-bold text-sm text-navy-950 hover:text-purple-700 flex items-center justify-between focus:outline-hidden focus:ring-2 focus:ring-purple-500 rounded p-1 transition">
              <span id="technical-details-heading">Technical details ({technicalNotes.length})</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider group-open:hidden">
                Show details
              </span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden group-open:inline">
                Hide details
              </span>
            </summary>
            <div className="mt-4 space-y-2.5 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-medium">
                Technical grounding and OCR verification checks recorded during document intake:
              </p>
              <ul className="space-y-2 list-none m-0 p-0">
                {technicalNotes.map((note, idx) => {
                  const message =
                    typeof note === "string"
                      ? note
                      : note.note || note.warning_text || note.message || "";
                  const code = typeof note === "object" ? note.code : null;
                  const page = typeof note === "object" ? note.source_page : null;

                  return (
                    <li
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-navy-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        {code && (
                          <span className="font-mono text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                            [{code}]
                          </span>
                        )}
                        <span className="font-medium leading-relaxed">
                          {message}
                        </span>
                      </div>
                      {page && (
                        <span className="text-[11px] font-semibold text-slate-400 shrink-0">
                          Page {page}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        </section>
      )}

      {/* Disclaimer */}
      <footer className="p-5 rounded-2xl bg-white border border-slate-200 text-center space-y-1 text-xs text-slate-500 shadow-xs">
        <p className="font-extrabold text-navy-950">
          This is a helper, not legal or financial advice. Always check the original notice.
        </p>
        <p>
          Notice2Action presents information returned by the connected processor to help organise next steps.
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
