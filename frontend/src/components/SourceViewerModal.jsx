import { useEffect, useState, useRef } from "react";
import { X, FileText, ExternalLink, AlertCircle, Loader2, Image as ImageIcon, Eye, HelpCircle } from "lucide-react";
import { getNoticePage, fetchNoticeFileBlob, getNoticeFileUrl } from "../api/client";
import { findQuoteHighlight } from "../utils/text";

export function SourceViewerModal({
  noticeId,
  page = 1,
  quote = null,
  isOpen,
  onClose,
  initialView = "document",
}) {
  const [activeTab, setActiveTab] = useState(quote ? "transcript" : initialView); // "document" | "transcript"
  const [pageData, setPageData] = useState(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState(null);

  const [fileBlobUrl, setFileBlobUrl] = useState(null);
  const [isImageFile, setIsImageFile] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState(null);

  const activeBlobUrlRef = useRef(null);
  const markRef = useRef(null);

  useEffect(() => {
    setActiveTab(quote ? "transcript" : initialView);
  }, [initialView, isOpen, quote]);

  useEffect(() => {
    if (activeTab === "transcript" && markRef.current) {
      markRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeTab, pageData, quote]);

  // Load page text transcript
  useEffect(() => {
    if (!isOpen || !noticeId || !page) return;

    let isCancelled = false;
    setLoadingText(true);
    setTextError(null);

    getNoticePage(noticeId, page)
      .then((data) => {
        if (!isCancelled) {
          setPageData(data);
          setLoadingText(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setTextError(err.message || "Failed to load page text transcript.");
          setLoadingText(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, noticeId, page]);

  // Authenticated fetch of the original file blob (PDF or photo)
  useEffect(() => {
    if (!isOpen || !noticeId) return;

    let isCancelled = false;
    setLoadingFile(true);
    setFileError(null);

    fetchNoticeFileBlob(noticeId)
      .then(({ blobUrl, isImage }) => {
        if (!isCancelled) {
          activeBlobUrlRef.current = blobUrl;
          setFileBlobUrl(blobUrl);
          setIsImageFile(isImage);
          setLoadingFile(false);
        } else {
          URL.revokeObjectURL(blobUrl);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          const msg =
            err.code === "FILE_NOT_FOUND" || (err.message && err.message.includes("unavailable"))
              ? "Original document file is unavailable for this sample/notice."
              : err.message || "Failed to load original document.";
          setFileError(msg);
          setLoadingFile(false);
        }
      });

    return () => {
      isCancelled = true;
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, [isOpen, noticeId]);

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

  const highlightResult = pageData ? findQuoteHighlight(pageData.text, quote) : null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-viewer-title"
    >
      <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200 shadow-elevated flex flex-col max-h-[92vh] overflow-hidden ui-fade-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Eye className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="source-viewer-title" className="text-base sm:text-lg font-black text-navy-950">
                Notice Evidence {page ? `• Page ${page}` : ""}
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                Verified official notice and verbatim extracted transcript
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View tabs */}
            <div className="inline-flex rounded-xl bg-slate-200/70 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab("document")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === "document"
                    ? "bg-white text-purple-900 shadow-xs"
                    : "text-slate-600 hover:text-navy-950"
                }`}
              >
                Original Document
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("transcript")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === "transcript"
                    ? "bg-white text-purple-900 shadow-xs"
                    : "text-slate-600 hover:text-navy-950"
                }`}
              >
                Text Transcript
              </button>
            </div>

            <a
              href={fileBlobUrl || (noticeId ? getNoticeFileUrl(noticeId) : "#")}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Original PDF"
              className="focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 min-h-[36px]"
            >
              <span>Original PDF</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Target Quote Callout (if opened from a quote citation) */}
          {quote && (
            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-purple-900">
                Referenced Supporting Quote:
              </span>
              <p className="text-xs sm:text-sm font-semibold italic text-navy-950 leading-relaxed">
                &ldquo;{quote}&rdquo;
              </p>
            </div>
          )}

          {/* TAB 1: ORIGINAL DOCUMENT (PDF OR IMAGE) */}
          {activeTab === "document" && (
            <div className="space-y-3">
              {loadingFile && (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  <p className="text-xs sm:text-sm font-bold">Loading original notice document...</p>
                </div>
              )}

              {fileError && !loadingFile && (
                <div
                  role="alert"
                  className="p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs sm:text-sm flex items-start gap-3 shadow-xs"
                >
                  <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-extrabold text-amber-950 text-sm">Original Document Unavailable</p>
                    <p className="mt-1 text-amber-900 leading-relaxed">{fileError}</p>
                    <p className="mt-2 text-[11px] text-amber-800 font-semibold">
                      Switch to the &ldquo;Text Transcript&rdquo; tab to inspect the extracted text.
                    </p>
                  </div>
                </div>
              )}

              {fileBlobUrl && !loadingFile && (
                <div className="rounded-2xl border border-slate-300 overflow-hidden bg-slate-100 flex items-center justify-center min-h-[50vh] max-h-[65vh]">
                  {isImageFile ? (
                    <img
                      src={fileBlobUrl}
                      alt="Original notice source"
                      className="max-h-[62vh] max-w-full object-contain mx-auto"
                    />
                  ) : (
                    <iframe
                      src={fileBlobUrl}
                      title="Original PDF Document"
                      className="w-full h-[62vh] border-0"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TEXT TRANSCRIPT */}
          {activeTab === "transcript" && (
            <div className="space-y-3">
              {loadingText && (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                  <p className="text-xs sm:text-sm font-bold">Loading official page transcript...</p>
                </div>
              )}

              {textError && !loadingText && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 text-xs sm:text-sm flex items-start gap-2.5"
                >
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold">Could not load page transcript</p>
                    <p className="mt-0.5">{textError}</p>
                  </div>
                </div>
              )}

              {/* Approximate Match Notice */}
              {quote && highlightResult && highlightResult.hasMatch && highlightResult.isApproximate && (
                <div
                  role="status"
                  className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-950 flex items-center gap-2.5 text-xs sm:text-sm"
                >
                  <HelpCircle className="w-4 h-4 text-sky-700 shrink-0" />
                  <span className="font-semibold">
                    Approximate match: Found matching text with minor punctuation or spacing difference.
                  </span>
                </div>
              )}

              {/* Quote Not Located Warning Banner - only when genuine failure */}
              {quote && highlightResult && !highlightResult.hasMatch && (
                <div
                  role="alert"
                  className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-1 text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertCircle className="w-4 h-4 text-amber-700" />
                    <span>Quote not located precisely</span>
                  </div>
                  <p className="text-slate-700">
                    The exact quote was not found on this page. Showing full page text.
                  </p>
                </div>
              )}

              {!loadingText && !textError && pageData && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Page {pageData.page_number} transcript ({pageData.char_count || 0} characters)</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-xs sm:text-sm leading-relaxed text-slate-800 whitespace-pre-wrap select-text max-h-[50vh] overflow-y-auto">
                    {highlightResult ? (
                      highlightResult.hasMatch ? (
                        <>
                          {highlightResult.before}
                          <mark ref={markRef} className="bg-cyan-200 text-navy-950 font-bold px-1 py-0.5 rounded border border-cyan-300 shadow-xs">
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
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex justify-end bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 min-h-[38px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
