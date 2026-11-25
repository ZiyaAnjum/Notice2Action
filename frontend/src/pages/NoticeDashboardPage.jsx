import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  Calendar,
  AlertTriangle,
  Upload,
  Loader2,
  FileText,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Info,
  AlertCircle,
  FileCheck,
  CheckCircle2,
} from "lucide-react";
import { getNotice, getNoticeFileUrl, retryNoticeExtraction } from "../api/client";
import { formatDate } from "../utils/text";
import { DecisionCard } from "../components/DecisionCard";
import { ActionChecklist } from "../components/ActionChecklist";
import { DeadlineTimeline } from "../components/DeadlineTimeline";
import { EvidencePanel } from "../components/EvidencePanel";
import { ProcessingStepper } from "../components/ProcessingStepper";
import { ReminderModal } from "../components/ReminderModal";
import { SimpleSummaryCard } from "../components/SimpleSummaryCard";
import { SourceViewerModal } from "../components/SourceViewerModal";

// Import mock fixtures for testing and fallback
import sampleElectricityNotice from "../mocks/sample_electricity_notice.json";
import partialNotice from "../mocks/partial_notice.json";
import failedNotice from "../mocks/failed_notice.json";
import processingNotice from "../mocks/processing_notice.json";

const MOCK_FIXTURES = {
  complete: sampleElectricityNotice,
  "sample_electricity_notice": sampleElectricityNotice,
  "notice-elec-001": sampleElectricityNotice,
  partial: partialNotice,
  "notice-partial-002": partialNotice,
  failed: failedNotice,
  "notice-failed-003": failedNotice,
  processing: processingNotice,
  "notice-proc-004": processingNotice,
};

function resolveInitialFixture() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const query = `${hash}&${search}`;
  for (const [key, fixture] of Object.entries(MOCK_FIXTURES)) {
    if (query.includes(`fixture=${key}`) || query.includes(`/notices/${key}`)) {
      return fixture;
    }
  }
  return null;
}

export function NoticeDashboardPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fixtureParam = searchParams.get("fixture");

  const initialFixture = resolveInitialFixture();
  const [notice, setNotice] = useState(initialFixture);
  const [loading, setLoading] = useState(!initialFixture);
  const [fetchError, setFetchError] = useState(null);

  // Evidence slide-over side panel state
  const [evidencePanel, setEvidencePanel] = useState({
    isOpen: false,
    page: null,
    quote: null,
  });

  // Reminder modal state
  const [reminderModal, setReminderModal] = useState({
    isOpen: false,
    deadline: null,
  });

  // Source viewer modal state
  const [sourceViewerModal, setSourceViewerModal] = useState({
    isOpen: false,
    page: 1,
    quote: null,
    initialView: "document",
  });

  const [isRetrying, setIsRetrying] = useState(false);

  const pollIntervalRef = useRef(null);

  const handleRetry = async () => {
    if (!id) return;
    setIsRetrying(true);
    try {
      await retryNoticeExtraction(id);
      setNotice((prev) => ({
        ...(prev || {}),
        status: "processing",
        stage: "reading_text",
        progress: 15,
      }));

      const pollStart = Date.now();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        if (Date.now() - pollStart > 45000) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setIsRetrying(false);
          setNotice((prev) => ({
            ...(prev || {}),
            status: "failed",
            error: "Processing reached the time limit. Please try again.",
          }));
          return;
        }
        try {
          const refreshed = await getNotice(id);
          if (refreshed.status !== "processing") {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setIsRetrying(false);
            setNotice(refreshed);
          }
        } catch {
          // ignore transient errors
        }
      }, 1500);
    } catch (err) {
      setIsRetrying(false);
      setFetchError(err.message || "Failed to trigger retry.");
    }
  };

  const fetchNoticeData = useCallback(async () => {
    // If fixture query param or mock id is requested, load local fixture immediately
    const targetKey = fixtureParam || id;
    if (targetKey && MOCK_FIXTURES[targetKey]) {
      setNotice(MOCK_FIXTURES[targetKey]);
      setLoading(false);
      setFetchError(null);
      return;
    }

    if (!id) return;
    setLoading(true);
    setFetchError(null);

    try {
      const data = await getNotice(id);
      setNotice(data);

      // If notice is processing, poll every 1.5s (with a 45s hard cutoff)
      if (data.status === "processing") {
        const pollStart = Date.now();
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(async () => {
            if (Date.now() - pollStart > 45000) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              setNotice((prev) => ({
                ...(prev || {}),
                status: "failed",
                error: "Processing reached the time limit. Please try again with a clearer or shorter notice.",
              }));
              return;
            }
            try {
              const refreshed = await getNotice(id);
              if (refreshed.status !== "processing") {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
                setNotice(refreshed);
              }
            } catch {
              // ignore transient network errors during poll
            }
          }, 1500);
        }
      } else if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    } catch (err) {
      // If server returned 404 and id matches a sample notice, fallback to mock
      if (MOCK_FIXTURES[id]) {
        setNotice(MOCK_FIXTURES[id]);
      } else {
        setFetchError(err.message || "Failed to load notice details.");
      }
    } finally {
      setLoading(false);
    }
  }, [id, fixtureParam]);

  useEffect(() => {
    if (initialFixture) return;
    fetchNoticeData();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [fetchNoticeData, initialFixture]);

  const handleOpenSource = (page, quote) => {
    setEvidencePanel({
      isOpen: true,
      page: page || 1,
      quote: quote || "",
    });
  };

  const handleCloseSource = () => {
    setEvidencePanel({
      isOpen: false,
      page: null,
      quote: null,
    });
  };

  // -------------------------------------------------------------
  // Loading & Initial Error States
  // -------------------------------------------------------------
  if (loading) {
    return (
      <main className="page-shell max-w-4xl space-y-4 py-12 text-center">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto" />
        <h1 className="text-xl font-black text-navy-950">Loading notice action plan...</h1>
      </main>
    );
  }

  if (fetchError || !notice) {
    return (
      <main className="page-shell max-w-3xl space-y-6 py-8">
        <div className="p-8 rounded-3xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-700">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black">Notice not found</h1>
          <p className="text-sm font-medium leading-relaxed">
            {fetchError || "The requested notice could not be retrieved from the server."}
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={fetchNoticeData}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Loading</span>
            </button>
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 min-h-[44px]"
            >
              Back to all notices
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // Processing State with 4-Step Stepper & Skeletons
  // -------------------------------------------------------------
  if (notice.status === "processing") {
    return (
      <main className="page-shell max-w-5xl space-y-6">
        <ProcessingStepper
          stage={notice.stage || "reading_text"}
          progress={notice.progress || 30}
          onRefresh={fetchNoticeData}
        />
      </main>
    );
  }

  // -------------------------------------------------------------
  // Failed / Needs Clearer / Out of Scope States
  // -------------------------------------------------------------
  if (notice.status === "needs_clearer_document") {
    return (
      <main className="page-shell max-w-3xl space-y-6 py-8">
        <div
          role="alert"
          className="bg-white border-2 border-amber-300 rounded-3xl p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-800">
            <AlertTriangle className="w-7 h-7" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-navy-950">
              Clearer Document Needed
            </h1>
            <p className="text-base text-slate-700 font-medium leading-relaxed">
              We could not read the text in this document clearly. The uploaded PDF appears to be a scanned image, blurry, or missing digital text.
            </p>
            {notice.message && (
              <p className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-mono">
                {notice.message}
              </p>
            )}
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black text-white bg-purple-600 hover:bg-purple-700 shadow-md min-h-[48px] focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            >
              <Upload className="w-5 h-5" />
              <span>Upload a Clearer File</span>
            </Link>
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[48px]"
            >
              Back to all notices
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (notice.status === "out_of_scope") {
    return (
      <main className="page-shell max-w-3xl space-y-6 py-8">
        <div
          role="alert"
          className="bg-white border-2 border-slate-300 rounded-3xl p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
            <FileText className="w-7 h-7" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-navy-950">
              Document Not Yet Classified
            </h1>
            <p className="text-base text-slate-700 font-medium leading-relaxed">
              The processing service did not recognize this document as an actionable notice. Notice2Action supports communications from public and institutional services.
            </p>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Supported Categories:
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { label: "Tax & payments", desc: "Council tax, municipal assessments, property tax" },
                { label: "Education & student funding", desc: "Admissions, fees, bursaries, hall notices" },
                { label: "Government & public services", desc: "Licensing, compliance, civil advisories" },
                { label: "Utilities & bills", desc: "Electricity, water, gas, broadband demand notes" },
              ].map((cat) => (
                <div key={cat.label} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="font-extrabold text-sm text-navy-950">{cat.label}</p>
                  <p className="text-xs text-slate-500 font-medium">{cat.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black text-white bg-purple-600 hover:bg-purple-700 shadow-md min-h-[48px]"
            >
              <Upload className="w-5 h-5" />
              <span>Upload Another Notice</span>
            </Link>
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[48px]"
            >
              Back to all notices
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Failed State: Friendly Message + Try Again Button
  if (
    notice.status === "failed" ||
    notice.status === "extraction_failed"
  ) {
    let friendlyError =
      notice.error ||
      notice.message ||
      "We couldn't read text from this PDF. Try a clearer scan.";
    if (/gemini|status\s*\d{3}|proto|api\s*key|syntaxerror|read\s*timeout|exception|httpx/i.test(friendlyError)) {
      friendlyError = "The AI extraction service encountered an issue analyzing this document. Please try again in a few moments.";
    }

    return (
      <main className="page-shell max-w-3xl space-y-6 py-8">
        <div
          role="alert"
          className="bg-white border-2 border-rose-300 rounded-3xl p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-700">
            <AlertTriangle className="w-7 h-7" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-navy-950">
              Document processing could not complete
            </h1>
            <p className="text-base text-slate-700 font-medium leading-relaxed">
              {friendlyError}
            </p>

            {notice.warnings && notice.warnings.length > 0 && (
              <ul className="mt-3 p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 space-y-1 list-disc list-inside font-mono">
                {notice.warnings.map((w, idx) => (
                  <li key={idx}>{typeof w === "string" ? w : JSON.stringify(w)}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Raw extracted text excerpt if any exists */}
          {notice.raw_text && (
            <details className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700">
              <summary className="font-bold cursor-pointer text-slate-800 hover:text-navy-950">
                View raw document text ({notice.raw_text.length} chars)
              </summary>
              <pre className="mt-2 p-3 bg-white rounded-xl border border-slate-200 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap max-h-48 text-slate-800">
                {notice.raw_text}
              </pre>
            </details>
          )}

          <div className="pt-2 flex flex-wrap gap-3">
            {id && !MOCK_FIXTURES[id] && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black text-white bg-purple-600 hover:bg-purple-700 shadow-md min-h-[48px] focus:outline-hidden focus:ring-2 focus:ring-purple-600 disabled:opacity-50"
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Retrying extraction...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    <span>Retry extraction</span>
                  </>
                )}
              </button>
            )}
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-black text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[48px]"
            >
              <Upload className="w-5 h-5" />
              <span>Upload another file</span>
            </Link>
            <Link
              to="/notices"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[48px]"
            >
              Back to all notices
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // Data Normalization (Supports Schema v2 and backward v1)
  // -------------------------------------------------------------
  const result = notice.result || {};

  const headline = notice.headline || {
    one_line_summary:
      notice.one_line_summary ||
      result.notice_title?.value ||
      notice.title ||
      notice.original_filename ||
      "Official Notice Action Plan",
    notice_type: notice.notice_type || result.category || notice.category || "Official Notice",
    source_organisation:
      notice.source_organisation ||
      result.issuing_organisation?.value ||
      notice.source_organization ||
      "",
    amount_due: notice.amount_due || null,
    primary_deadline_id: notice.primary_deadline_id || null,
    urgency: notice.urgency || "soon",
  };

  const noticeDate = notice.notice_date || result.notice_date || null;

  const rawDeadlinesList = Array.isArray(notice.deadlines)
    ? notice.deadlines
    : Array.isArray(result.deadlines)
    ? result.deadlines
    : [];

  const deadlines = rawDeadlinesList.map((d, i) => ({
    id: d.id || `dl_${i + 1}`,
    label: d.label || d.description || "Deadline",
    kind: d.kind || "due",
    date: d.date || d.iso_date || null,
    date_type: d.date_type || "exact",
    urgency: d.urgency || (d.date || d.iso_date ? "fixed" : "none"),
    anchor_date: d.anchor_date || null,
    date_rule_text: d.date_rule_text || null,
    derived_from: d.derived_from || null,
    evidence: d.evidence || null,
    status: d.status || "found",
  }));

  // Determine primary deadline for the decision card countdown
  const primaryDeadline =
    deadlines.find((d) => d.id === headline.primary_deadline_id) ||
    deadlines[0] ||
    null;

  const actionSteps = Array.isArray(notice.action_steps)
    ? notice.action_steps
    : Array.isArray(result.action_steps)
    ? result.action_steps.map((s, i) => ({
        order: s.order || i + 1,
        text: typeof s === "string" ? s : s.text || s.action || "",
        action_type: s.action_type || "required",
        group_id: s.group_id || null,
        group_title: s.group_title || null,
        condition: s.condition || null,
        evidence: s.evidence || null,
      }))
    : [];

  const consequences = Array.isArray(notice.consequences)
    ? notice.consequences
    : Array.isArray(result.penalties)
    ? result.penalties.map((p) => ({
        label: p.label || p.type || "Consequence",
        value: p.consequence || p.text || p.value || "",
        evidence: p.evidence || null,
      }))
    : [];

  const requiredDocuments = (
    Array.isArray(notice.required_documents)
      ? notice.required_documents
      : Array.isArray(result.required_documents)
      ? result.required_documents
      : []
  ).filter((doc) => doc && (doc.name || typeof doc === "string"));

  const whereToSubmit = notice.where_to_submit || result.submission_channel || [];

  const conditionsThatApply = (
    Array.isArray(notice.conditions_that_apply) ? notice.conditions_that_apply : []
  ).filter((c) => c && (c.condition || typeof c === "string"));

  const summaryPlain =
    notice.summary_plain ||
    result.plain_language_summary?.what_is_this ||
    (typeof result.plain_language_summary === "string" ? result.plain_language_summary : null);

  const warnings = notice.warnings || result.warnings || [];
  const technicalNotes = result.technical_notes || notice.technical_notes || [];
  const pdfUrl = id ? getNoticeFileUrl(id) : "#";

  return (
    <main className="page-shell max-w-5xl space-y-6 sm:space-y-8">
      {/* Top Header Actions Bar: Back Link + Notice Date Badge + View Original Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            to="/notices"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-600 hover:text-navy-950 transition-colors"
          >
            ← Back to all notices
          </Link>
          {noticeDate && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-purple-700" aria-hidden="true" />
              <span>Notice date: {formatDate(noticeDate)}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            setSourceViewerModal({
              isOpen: true,
              page: 1,
              quote: null,
              initialView: "document",
            })
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-purple-700 shadow-xs transition-colors min-h-[40px] focus:outline-hidden focus:ring-2 focus:ring-purple-600"
        >
          <FileText className="w-4 h-4 text-purple-600" aria-hidden="true" />
          <span>View original</span>
        </button>
      </div>

      {/* Slim Inline Notice for Partial Extraction (No huge page-wide banner) */}
      {notice.status === "partial" && (
        <aside
          role="status"
          aria-live="polite"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs sm:text-sm text-amber-950 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-800 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-extrabold text-amber-950">
                Partial extraction: Some sections could not be completely read
              </p>
              {warnings.length > 0 && (
                <ul className="list-disc list-inside space-y-0.5 text-amber-900 font-medium">
                  {warnings.map((w, idx) => (
                    <li key={idx}>{typeof w === "string" ? w : w.message || JSON.stringify(w)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {id && !MOCK_FIXTURES[id] && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold bg-amber-700 hover:bg-amber-800 text-white shrink-0 self-start sm:self-center transition-colors disabled:opacity-50 min-h-[38px]"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Retrying...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry extraction</span>
                </>
              )}
            </button>
          )}
        </aside>
      )}

      {/* Plain-Language Simple Summary Card */}
      <SimpleSummaryCard
        noticeId={id || notice?.id || notice?.notice_id}
        simpleSummary={result.simple_summary || notice.simple_summary}
        fallbackData={notice}
        lastUpdated={notice?.status}
      />

      {/* 1. Decision Card (Hero) */}
      <DecisionCard
        headline={headline}
        primaryDeadline={primaryDeadline}
        pdfUrl={pdfUrl}
        noticeId={id}
        onViewOriginal={() =>
          setSourceViewerModal({
            isOpen: true,
            page: 1,
            quote: null,
            initialView: "document",
          })
        }
        onRemind={() =>
          setReminderModal({
            isOpen: true,
            deadline: primaryDeadline,
          })
        }
      />

      {/* 2. "What to do" Checklist */}
      <ActionChecklist
        steps={actionSteps}
        whereToSubmit={whereToSubmit}
        noticeId={id}
        onShowSource={handleOpenSource}
      />

      {/* 3. Timeline of Deadlines with Embedded Consequences */}
      <DeadlineTimeline
        deadlines={deadlines}
        consequences={consequences}
        onShowSource={handleOpenSource}
        onRemind={(dl) =>
          setReminderModal({
            isOpen: true,
            deadline: dl,
          })
        }
      />

      {/* 4. Plain-Language Summary (2-3 sentences replacing 5 Questions) */}
      {summaryPlain && (
        <section
          aria-labelledby="summary-heading"
          className="bg-white border-2 border-slate-300 rounded-3xl p-6 sm:p-8 shadow-xs space-y-2.5"
        >
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-purple-600" aria-hidden="true" />
            <h2 id="summary-heading" className="text-xl sm:text-2xl font-black text-navy-950">
              Plain-Language Summary
            </h2>
          </div>
          <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-medium">
            {summaryPlain}
          </p>
        </section>
      )}

      {/* 5. Collapsed Sections (Closed by default, only rendered if non-empty) */}
      <div className="space-y-3">
        {/* Required Documents (Render ONLY if non-empty) */}
        {requiredDocuments.length > 0 && (
          <details className="group rounded-2xl bg-white border border-slate-300 p-4 sm:p-5 shadow-xs text-slate-800 transition-all">
            <summary className="cursor-pointer font-extrabold text-sm sm:text-base text-navy-950 flex items-center justify-between focus:outline-hidden focus:ring-2 focus:ring-purple-600 rounded p-1">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-purple-600" aria-hidden="true" />
                <span>Required Documents ({requiredDocuments.length})</span>
              </div>
              <ChevronDown className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs text-slate-500 font-medium">
                Keep these documents accessible when paying or submitting response:
              </p>
              <ul className="space-y-2 list-none m-0 p-0" role="list">
                {requiredDocuments.map((doc, idx) => {
                  const name = typeof doc === "string" ? doc : doc.name;
                  const hasSource = doc.evidence && (doc.evidence.page || doc.evidence.quote);
                  const condition = typeof doc === "object" ? doc.condition : null;

                  return (
                    <li
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-navy-950">{name}</span>
                        {condition && (
                          <span className="text-xs font-normal text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            (only if {condition})
                          </span>
                        )}
                      </div>
                      {hasSource && (
                        <button
                          type="button"
                          onClick={() => handleOpenSource(doc.evidence.page, doc.evidence.quote)}
                          aria-label={`View source citation for ${name}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline min-h-[32px] px-1"
                        >
                          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Source {doc.evidence.page ? `p.${doc.evidence.page}` : ""}</span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        )}

        {/* Other Conditions (Render ONLY if non-empty) */}
        {conditionsThatApply.length > 0 && (
          <details className="group rounded-2xl bg-white border border-slate-300 p-4 sm:p-5 shadow-xs text-slate-800 transition-all">
            <summary className="cursor-pointer font-extrabold text-sm sm:text-base text-navy-950 flex items-center justify-between focus:outline-hidden focus:ring-2 focus:ring-purple-600 rounded p-1">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-purple-600" aria-hidden="true" />
                <span>Conditions That Apply ({conditionsThatApply.length})</span>
              </div>
              <ChevronDown className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <ul className="space-y-2 list-none m-0 p-0" role="list">
                {conditionsThatApply.map((item, idx) => {
                  const condText = typeof item === "string" ? item : item.condition;
                  const hasSource = item.evidence && (item.evidence.page || item.evidence.quote);

                  return (
                    <li
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-800">{condText}</span>
                      {hasSource && (
                        <button
                          type="button"
                          onClick={() => handleOpenSource(item.evidence.page, item.evidence.quote)}
                          aria-label={`View source citation`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline min-h-[32px] px-1"
                        >
                          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Source</span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        )}

        {/* Technical Details (Validation notes, schema version, raw_text_ref) */}
        <details className="group rounded-2xl bg-white border border-slate-300 p-4 sm:p-5 shadow-xs text-slate-800 transition-all">
          <summary className="cursor-pointer font-extrabold text-sm sm:text-base text-navy-950 flex items-center justify-between focus:outline-hidden focus:ring-2 focus:ring-purple-600 rounded p-1">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-slate-500" aria-hidden="true" />
              <span>Technical details {technicalNotes.length > 0 ? `(${technicalNotes.length})` : ""}</span>
            </div>
            <ChevronDown className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 text-xs text-slate-600">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <dt className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Schema Version</dt>
                <dd className="mt-1 font-mono font-bold text-slate-800">{notice.schema_version || "2.0.0"}</dd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <dt className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Processing Status</dt>
                <dd className="mt-1 font-bold capitalize text-slate-800">{notice.status || "Complete"}</dd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <dt className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Document Reference</dt>
                <dd className="mt-1 font-mono truncate text-slate-800">{notice.raw_text_ref || notice.original_filename || id}</dd>
              </div>
            </dl>

            {technicalNotes.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="font-bold text-slate-700">Diagnostics and grounding checks:</p>
                <ul className="space-y-1.5 list-none m-0 p-0 font-mono text-[11px]">
                  {technicalNotes.map((note, idx) => (
                    <li key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
                      {note.code && <span className="font-bold text-purple-700">[{note.code}]</span>}
                      <span className="text-slate-800">{note.note || note.warning_text || (typeof note === "string" ? note : JSON.stringify(note))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>

      {/* 6. Footer Disclaimer (Single, concise line) */}
      <footer className="py-4 text-center text-xs text-slate-500">
        <p className="font-semibold">
          Helper, not legal or financial advice. Check the original notice.
        </p>
      </footer>

      {/* Slide-over Evidence Panel */}
      <EvidencePanel
        noticeId={id}
        page={evidencePanel.page}
        quote={evidencePanel.quote}
        isOpen={evidencePanel.isOpen}
        onClose={handleCloseSource}
      />

      {/* Reminder Modal */}
      <ReminderModal
        noticeId={id}
        deadline={reminderModal.deadline}
        noticeDate={noticeDate}
        isOpen={reminderModal.isOpen}
        onClose={() => setReminderModal({ isOpen: false, deadline: null })}
      />

      {/* Full Document & Transcript Modal */}
      <SourceViewerModal
        noticeId={id}
        page={sourceViewerModal.page}
        quote={sourceViewerModal.quote}
        isOpen={sourceViewerModal.isOpen}
        initialView={sourceViewerModal.initialView}
        onClose={() =>
          setSourceViewerModal({
            isOpen: false,
            page: 1,
            quote: null,
            initialView: "document",
          })
        }
      />
    </main>
  );
}
