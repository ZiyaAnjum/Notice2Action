import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileText,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { uploadNotice, getNotice } from "../api/client";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60000; // 60s timeout

export function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [currentNoticeId, setCurrentNoticeId] = useState(null);

  // Clean up any pending poll timer on unmount
  const pollTimerRef = useRef(null);
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const validateFile = (file) => {
    if (!file) {
      return "Please select a PDF file.";
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return "Only PDF files are supported. Please select an official notice in PDF format.";
    }
    if (file.size === 0) {
      return "The selected file is empty. Please upload a valid PDF document.";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return "This file is larger than 10MB. Please upload a PDF under 10MB.";
    }
    return null;
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const pollNoticeStatus = (noticeId) => {
    setCurrentNoticeId(noticeId);
    const startTime = Date.now();

    pollTimerRef.current = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > POLL_TIMEOUT_MS) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setIsProcessing(false);
        setPollTimedOut(true);
        return;
      }

      try {
        const detail = await getNotice(noticeId);
        if (detail.status && detail.status !== "processing") {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setStatusMessage("Reading complete! Opening dashboard...");
          setTimeout(() => {
            navigate(`/notices/${noticeId}`);
          }, 400);
        }
      } catch (pollErr) {
        console.warn("Polling check error:", pollErr);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Please choose a PDF notice file first.");
      return;
    }

    setErrorMessage(null);
    setPollTimedOut(false);
    setIsProcessing(true);
    setStatusMessage("Reading your notice...");

    try {
      const uploadRes = await uploadNotice(selectedFile);
      if (uploadRes.status && uploadRes.status !== "processing") {
        navigate(`/notices/${uploadRes.id}`);
        return;
      }
      pollNoticeStatus(uploadRes.id);
    } catch (err) {
      setIsProcessing(false);
      setErrorMessage(err.message || "Failed to upload notice. Please try again.");
    }
  };

  return (
          <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">
            {/* Hero Header */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-royal-50 text-royal-700 border border-royal-200/80 shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                <span>Intelligent Notice Extraction</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight leading-tight">
                Upload Your Notice
              </h1>

                <p className="text-base sm:text-lg text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
                  We extract every deadline, required document, and action step so you know exactly what to do next.
                </p>

                {/* Feature Highlights Pills */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs font-semibold text-slate-600">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 shadow-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Zero-hallucination citations
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 shadow-xs">
                    <Clock className="w-3.5 h-3.5 text-royal-600" />
                    Live deadline countdowns
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 shadow-xs">
                    <Lock className="w-3.5 h-3.5 text-cyan-600" />
                    Private &amp; self-deletable
                  </span>
                </div>
            </div>

            {/* Processing State Banner */}
            {isProcessing && (
              <div
                role="status"
                aria-live="polite"
                className="bg-white border-2 border-royal-400 rounded-3xl p-8 sm:p-12 text-center space-y-6 shadow-glow"
              >
                  <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 rounded-2xl bg-royal-100 animate-ping opacity-60" />
                    <div className="relative w-16 h-16 rounded-2xl bg-royal-600 flex items-center justify-center text-white shadow-md">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-950 tracking-tight">{statusMessage}</h2>
                        <p className="text-sm sm:text-base text-slate-600 max-w-md mx-auto">
                          Extracting text and identifying deadlines, checklist items, and requirements...
                        </p>
                      </div>
                        <div className="max-w-md mx-auto space-y-2">
                          <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                            <div className="bg-gradient-to-r from-royal-600 to-cyan-500 h-full animate-pulse w-3/4 rounded-full" />
                          </div>
                          <p className="text-xs text-slate-400 font-medium">Grounding claims against verbatim PDF quotes...</p>
                        </div>
                      </div>
      )}

                      {/* Polling Timeout State */}
                      {pollTimedOut && (
                        <div
                          role="alert"
                          className="bg-amber-50/90 border-2 border-amber-400 rounded-3xl p-8 text-center space-y-5 shadow-card"
                        >
                              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                                <AlertCircle className="w-8 h-8" />
                              </div>
                              <div className="space-y-1">
                                <h2 className="text-2xl font-black text-amber-950 tracking-tight">
                                  Processing is taking longer than expected
                                </h2>
                                  <p className="text-sm sm:text-base text-amber-900 max-w-lg mx-auto">
                                    Your notice is still processing in the background. You can open its dashboard now or check it on the past notices page.
                                  </p>
                              </div>
                              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                                {currentNoticeId && (
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/notices/${currentNoticeId}`)}
                                    className="px-6 py-3 rounded-xl font-bold text-white bg-royal-600 hover:bg-royal-700 shadow-sm min-h-[44px]"
                                  >
                                    Open Dashboard
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => navigate("/notices")}
                                  className="px-6 py-3 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 min-h-[44px]"
                                >
                                  Go to Past Notices
                                </button>
                              </div>
                          </div>
      )}

                          {/* Main Upload Card */}
                          {!isProcessing && !pollTimedOut && (
                              <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-elevated space-y-8">
                                {/* Error Banner */}
                                {errorMessage && (
                                  <div
                                    role="alert"
                                    className="p-4 sm:p-5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 flex items-start gap-3.5 shadow-xs"
                                  >
                                    <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-extrabold text-sm sm:text-base">Upload could not proceed</p>
                                      <p className="text-sm mt-0.5 text-rose-900 font-medium">{errorMessage}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Drag & Drop Zone */}
<div
  onDragEnter={handleDrag}
  onDragLeave={handleDrag}
  onDragOver={handleDrag}
  onDrop={handleDrop}
  onClick={() => fileInputRef.current?.click()}
  className={`group relative rounded-3xl border-2 border-dashed p-8 transition-all duration-300 cursor-pointer ${
    dragActive
      ? "border-cyan-500 bg-cyan-50/70 shadow-cyan-glow scale-[1.01]"
      : selectedFile
        ? "border-emerald-500 bg-emerald-50/40"
        : "border-slate-300 hover:border-royal-400 bg-slate-50/60 hover:bg-slate-50"
  }`}
>
  <input
    ref={fileInputRef}
    type="file"
    accept="application/pdf,.pdf"
    onChange={handleFileChange}
    className="sr-only"
    id="notice-file-input"
    aria-label="Upload notice PDF"
  />

            {selectedFile ? (
              <div className="space-y-3 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div>
                  <p className="text-lg sm:text-xl font-extrabold text-slate-950 break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-1">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-royal-600 underline hover:text-royal-800 pt-1"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-royal-50 text-royal-600 border border-royal-200/70 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform shadow-xs">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    Drag and drop your PDF notice here
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    or <span className="text-royal-600 font-extrabold underline decoration-2 underline-offset-2">browse your files</span>
                  </p>
                </div>
                <div className="pt-2">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-200/70 text-slate-600">
                    PDF format only • Maximum file size 10MB
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <span className="text-xs text-slate-500 font-medium">
              Supports Tax, Utility, Banking, College, &amp; Government notices
            </span>
            <button
              type="button"
              disabled={!selectedFile}
              onClick={handleSubmit}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-2xl font-black text-base text-white bg-gradient-to-r from-royal-600 to-royal-700 hover:from-royal-500 hover:to-royal-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-glow transition-all focus:outline-hidden focus:ring-4 focus:ring-royal-500/40 min-h-[48px]"
            >
              <FileText className="w-5 h-5" aria-hidden="true" />
              <span>Read Notice &amp; Build Action Plan</span>
              <ArrowRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
            </button>
          </div>

          {/* Privacy Note */}
          <div className="pt-6 border-t border-slate-100 flex items-start gap-3.5 text-xs sm:text-sm text-slate-600 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
            <ShieldCheck className="w-5 h-5 text-royal-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">
              <strong className="text-slate-950 font-bold">Privacy Guarantee:</strong> Your notice is processed securely by an AI service and stored privately until you choose to delete it. You can permanently delete your notice and all files at any time with one click.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
