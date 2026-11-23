import { useEffect, useState } from "react";
import {
  X,
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  Image as ImageIcon,
} from "lucide-react";
import { getNoticePage, getNoticeFileUrl, getNoticePageImageUrl } from "../api/client";
import { findQuoteHighlight } from "../utils/text";

export function EvidencePanel({
  noticeId,
  page,
  quote,
  isOpen,
  onClose,
}) {
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState("text"); // "text" | "image"

  useEffect(() => {
    if (!isOpen || !noticeId || !page) return;

    let isCancelled = false;
    setLoading(true);
    setError(null);

    getNoticePage(noticeId, page)
      .then((data) => {
        if (!isCancelled) {
          setPageData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err.message || "Failed to load page text.");
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, noticeId, page]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const pdfUrl = noticeId ? getNoticeFileUrl(noticeId) : "#";
  const highlightResult = pageData ? findQuoteHighlight(pageData.text, quote) : null;

  const handleCopyQuote = async () => {
    if (!quote) return;
    try {
      await navigator.clipboard.writeText(quote);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-navy-950/50 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-panel-title"
    >
      {/* Click outside to close */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over side panel */}
      <aside
        className="relative z-10 w-full max-w-xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 animate-in slide-in-from-right duration-200"
        aria-label="Evidence Verification Panel"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
              <FileText className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="evidence-panel-title" className="text-base sm:text-lg font-black text-navy-950">
                Notice Evidence • Page {page || 1}
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                Verbatim text grounded in uploaded document
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 min-h-[36px]"
              >
                <span>Original PDF</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center focus:outline-hidden focus:ring-2 focus:ring-purple-600"
              aria-label="Close evidence panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Target Quote Card */}
          <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-purple-900">
                Supporting Quotation
              </span>
              <button
                type="button"
                onClick={handleCopyQuote}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Quote</span>
                  </>
                )}
              </button>
            </div>

            <blockquote className="font-mono text-xs sm:text-sm text-navy-950 bg-white p-3 rounded-xl border border-purple-100 leading-relaxed italic">
              &ldquo;{quote || "No specific quotation recorded"}&rdquo;
            </blockquote>

            {/* Verification status badge */}
            <div className="pt-1">
              {highlightResult?.found ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span>Verified verbatim on page {page}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-700" aria-hidden="true" />
                  <span>Check original scan: quote matched with fuzzy spacing</span>
                </div>
              )}
            </div>
          </div>

          {/* Tab / View Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("text")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 min-h-[36px] ${
                viewMode === "text"
                  ? "bg-white text-purple-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Extracted Text</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("image")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 min-h-[36px] ${
                viewMode === "image"
                  ? "bg-white text-purple-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Original Photo / Page</span>
            </button>
          </div>

          {/* Mode 1: Full Page Text Excerpt with Highlighted Quote */}
          {viewMode === "text" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Page {page || 1} Extracted Text
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  Highlighted line shows claim grounding
                </span>
              </div>

              {loading && (
                <div className="p-8 text-center text-slate-500 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600" />
                  <p className="text-xs font-medium">Loading page text...</p>
                </div>
              )}

              {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <p className="font-bold">Could not load extracted text</p>
                  <p className="mt-1">{error}</p>
                </div>
              )}

              {!loading && !error && highlightResult && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 leading-relaxed max-h-[420px] overflow-y-auto whitespace-pre-wrap select-text">
                  {highlightResult.hasMatch ? (
                    <>
                      <span>{highlightResult.before}</span>
                      <mark className="bg-amber-200 text-amber-950 font-bold px-1 py-0.5 rounded border border-amber-300">
                        {highlightResult.highlighted || highlightResult.matched}
                      </mark>
                      <span>{highlightResult.after}</span>
                    </>
                  ) : (
                    <span>{highlightResult.text || "No text available for this page."}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Original Color Photo / Page Image */}
          {viewMode === "image" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Page {page || 1} Original Document Photo / Scan
                </h3>
                {noticeId && (
                  <a
                    href={getNoticePageImageUrl(noticeId, page || 1)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-purple-700 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Open full image</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="p-2 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center max-h-[420px] overflow-auto">
                <img
                  src={getNoticePageImageUrl(noticeId, page || 1)}
                  alt={`Notice page ${page || 1} original document photo`}
                  className="max-h-[400px] w-auto object-contain rounded-lg"
                  loading="lazy"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Notice2Action Evidence Verifier</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[36px]"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

