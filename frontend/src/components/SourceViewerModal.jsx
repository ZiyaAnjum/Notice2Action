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
      className="fixed inset-0 z-50 overflow-y-auto bg-charcoal-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-viewer-title"
    >
        <div className="bg-white rounded-3xl max-w-3xl w-full border border-stone-200/90 shadow-elevated flex flex-col max-h-[90vh] overflow-hidden">
          {/* Header */}
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between gap-4 bg-stone-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
                  <FileText className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="source-viewer-title" className="text-lg font-black text-stone-950">
                    Notice Evidence • Page {page}
                  </h2>
                  <span className="text-xs text-stone-500 font-medium">
                    Extracted text from the uploaded source document
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-stone-700 bg-white border border-stone-300 hover:bg-stone-50"
                >
                  <span>Original PDF</span>
                  <ExternalLink className="w-3.5 h-3.5 text-stone-500" aria-hidden="true" />
                </a>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Target Quote Callout */}
              {quote && (
                <div className="p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200 space-y-1">
                  <span className="text-xs font-black uppercase tracking-wider text-teal-900">
                    Extracted Supporting Quote:
                  </span>
                  <p className="text-xs sm:text-sm font-semibold italic text-stone-900">
                    &ldquo;{quote}&rdquo;
                  </p>
                </div>
              )}

                {/* Quote Not Located Warning Banner */}
                {highlightResult && !highlightResult.hasMatch && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-1 text-xs sm:text-sm"
                  >
                    <div className="flex items-center gap-2 font-bold text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-700" />
                      <span>Quote not located precisely</span>
                    </div>
                    <p className="text-stone-700">
                      The exact quote was not found on this page. Showing full page text.
                    </p>
                  </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-stone-500">
                      <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                      <p className="text-xs sm:text-sm font-bold">Loading official page transcript...</p>
                    </div>
          )}

                        {/* Error */}
                        {error && !loading && (
                          <div
                            role="alert"
                            className="p-4 rounded-xl bg-coral-50 border border-coral-300 text-coral-950 text-xs sm:text-sm flex items-start gap-2.5"
                          >
                            <AlertCircle className="w-5 h-5 text-coral-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-extrabold">Could not load page text</p>
                              <p className="mt-0.5">{error}</p>
                            </div>
                          </div>
                        )}

          {/* Page text with highlighted quote */}
                              {!loading && !error && pageData && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs text-stone-400">
                                    <span>Page {pageData.page_number} transcript ({pageData.char_count || 0} characters)</span>
                                    <span>Compare with original PDF</span>
                                  </div>
                                  <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 font-mono text-xs sm:text-sm leading-relaxed text-stone-800 whitespace-pre-wrap select-text max-h-[50vh] overflow-y-auto">
                                    {highlightResult ? (
                                      highlightResult.hasMatch ? (
                                        <>
                                          {highlightResult.before}
                                          <mark className="bg-teal-200 text-teal-950 font-bold px-1 py-0.5 rounded border border-teal-400 shadow-xs">
                                            {highlightResult.matched}
                                          </mark>
                                          {highlightResult.after}
                                        </>
                                      ) : (
                                        pageData.text
                                      )
                                    ) : (
                  pageData.text || "No text available on this page."
                )}
                                  </div>
            </div>
          )}
                          </div>

                        {/* Footer */}
                          <div className="px-6 py-3 border-t border-stone-100 flex justify-end bg-stone-50/50">
                            <button
                              type="button"
                              onClick={onClose}
                              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-stone-700 bg-white border border-stone-300 hover:bg-stone-50"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    );
}
