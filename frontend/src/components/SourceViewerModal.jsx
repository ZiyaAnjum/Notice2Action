import { useEffect, useState } from "react";
import { X, FileText, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { getNoticePage, getNoticeFileUrl } from "../api/client";
import { findQuoteHighlight } from "../utils/text";

export function SourceViewerModal({ noticeId, page, quote, isOpen, onClose }) {
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const pdfUrl = noticeId ? getNoticeFileUrl(noticeId) : "#";
  const highlightResult = pageData ? findQuoteHighlight(pageData.text, quote) : null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-viewer-title"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full border-2 border-slate-300 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-700" aria-hidden="true" />
            <h2 id="source-viewer-title" className="text-lg font-bold text-slate-900">
              Notice Evidence • Page {page}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[36px]"
            >
              <span>Original PDF</span>
              <ExternalLink className="w-4 h-4 text-slate-500" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-600"
              aria-label="Close source view"
            >
              <X className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Evidence Quote Prompt */}
        {quote && (
          <div className="px-5 py-3 bg-indigo-50/80 border-b border-indigo-100 text-xs sm:text-sm text-indigo-950 flex flex-col sm:flex-row sm:items-baseline gap-1.5">
            <span className="font-bold uppercase tracking-wider text-indigo-700 flex-shrink-0">
              Quoted from notice:
            </span>
            <span className="italic font-medium text-indigo-900">&ldquo;{quote}&rdquo;</span>
          </div>
        )}

        {/* Content body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 text-slate-800 space-y-4">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-600">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="font-medium text-sm">Loading page text from notice...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Unable to load page text</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && highlightResult && (
            <>
              {!highlightResult.found && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2.5 text-xs sm:text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Quote not located precisely</span>
                    <span>{highlightResult.reason || "The exact quote was not found on this page. Showing full page text below."}</span>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 font-mono text-xs sm:text-sm leading-relaxed whitespace-pre-wrap select-text">
                {highlightResult.found ? (
                  <>
                    <span>{highlightResult.before}</span>
                    <mark className="bg-amber-300 text-slate-950 px-1 py-0.5 rounded-xs font-bold underline decoration-amber-600">
                      {highlightResult.highlighted}
                    </mark>
                    <span>{highlightResult.after}</span>
                  </>
                ) : (
                  <span>{highlightResult.text}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Page {page} of uploaded notice</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-bold text-slate-700 hover:bg-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
