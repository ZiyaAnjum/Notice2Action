import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  FileText,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  FileCheck,
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
      <main className="max-w-3xl mx-auto space-y-8">
        {/* Page Title & Institutional Heading */}
        <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200/80">
              <FileCheck className="w-3.5 h-3.5" />
              <span>Institutional Document Intake</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-stone-950 tracking-tight">
              Upload Your Notice
            </h1>
              <p className="text-sm sm:text-base text-stone-600 font-medium max-w-xl mx-auto leading-relaxed">
                We extract every deadline, required document, and action step so you know exactly what to do next.
              </p>
            </div>

            {/* Processing State Banner */}
            {isProcessing && (
              <div
                role="status"
                aria-live="polite"
                className="bg-white border-2 border-teal-500 rounded-3xl p-6 sm:p-10 text-center space-y-4 shadow-elevated"
              >
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                </div>
                <div>
                    <h2 className="text-xl font-black text-stone-900">{statusMessage}</h2>
                    <p className="text-xs sm:text-sm text-stone-600 mt-1 max-w-md mx-auto">
                      Extracting text and identifying deadlines, checklist items, and requirements...
                    </p>
                </div>
                  <div className="max-w-xs mx-auto bg-stone-100 rounded-full h-2 overflow-hidden border border-stone-200">
                    <div className="bg-teal-600 h-full animate-pulse w-3/4 rounded-full" />
                  </div>
                </div>
      )}

                {/* Polling Timeout State */}
                {pollTimedOut && (
                  <div
                    role="alert"
                    className="bg-amber-50 border-2 border-amber-400 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-card"
                  >
                    <AlertCircle className="w-10 h-10 text-amber-700 mx-auto" />
                    <div>
                        <h2 className="text-xl font-black text-amber-950">
                          Processing is taking longer than expected
                        </h2>
                          <p className="text-xs sm:text-sm text-amber-900 mt-1 max-w-md mx-auto">
                            Your notice is still processing in the background. You can open its dashboard now or check it on the past notices page.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                          {currentNoticeId && (
                            <button
                              type="button"
                              onClick={() => navigate(`/notices/${currentNoticeId}`)}
                              className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-teal-600 hover:bg-teal-700 shadow-xs min-h-[44px]"
                            >
                              Open Dashboard
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate("/notices")}
                            className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 min-h-[44px]"
                          >
                            Go to Past Notices
                          </button>
                        </div>
                    </div>
      )}

                    {/* Main Upload Card */}
                    {!isProcessing && !pollTimedOut && (
                        <div className="bg-white border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-card space-y-6">
                          {/* Error Banner */}
                          {errorMessage && (
                            <div
                              role="alert"
                              className="p-4 rounded-2xl bg-coral-50 border border-coral-200 text-coral-950 flex items-start gap-3 shadow-xs"
                            >
                              <AlertCircle className="w-5 h-5 text-coral-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-extrabold text-sm">Upload could not proceed</p>
                                <p className="text-xs sm:text-sm mt-0.5 text-coral-900 font-medium">{errorMessage}</p>
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
            className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 focus-within:ring-4 focus-within:ring-teal-600/30 ${dragActive
                                ? "border-teal-600 bg-teal-50/70 scale-[1.01]"
                                : selectedFile
                ? "border-emerald-500 bg-sage-50/60"
                          : "border-stone-300 hover:border-teal-500 bg-stone-50/60 hover:bg-stone-50"
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
                            <div className="space-y-2">
                              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                                <p className="text-base sm:text-lg font-black text-stone-950 break-all">
                                  {selectedFile.name}
                                </p>
                                <p className="text-xs font-semibold text-stone-500">
                                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                                </p>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fileInputRef.current?.click();
                                  }}
                                  className="text-xs font-bold text-teal-700 underline hover:text-teal-900 pt-1"
                                >
                                  Choose a different file
                                </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto">
                                  <UploadCloud className="w-6 h-6" />
                                </div>
                                <p className="text-base sm:text-lg font-black text-stone-900">
                                  Drag and drop your PDF notice here
                                </p>
                                  <p className="text-xs sm:text-sm text-stone-500">
                                    or <span className="text-teal-700 font-extrabold underline">browse your files</span>
                                  </p>
                                    <p className="text-[11px] font-semibold text-stone-400 pt-1">
                                      PDF format only • Maximum file size 10MB
                                    </p>
                                  </div>
            )}
                                </div>

                                {/* Action button */}
                                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                                    <span className="text-[11px] text-stone-500 font-medium">
                                      Tax, Utility, Banking, College, &amp; Government Scheme notices
                                    </span>
                                    <button
                                      type="button"
                                      disabled={!selectedFile}
                                      onClick={handleSubmit}
                                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-black text-sm text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all focus:outline-hidden focus:ring-4 focus:ring-teal-600/30 min-h-[48px]"
                                    >
                                      <FileText className="w-4 h-4" aria-hidden="true" />
                                      <span>Read Notice &amp; Build Action Plan</span>
                                    </button>
                                  </div>

                                  {/* Privacy Note */}
                                      <div className="pt-4 border-t border-stone-100 flex items-start gap-3 text-xs text-stone-600 bg-stone-50/70 p-4 rounded-2xl border border-stone-200/80">
                                        <ShieldCheck className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                        <p className="leading-relaxed">
                                          <strong className="text-stone-900 font-bold">Privacy Guarantee:</strong> Your notice is processed securely by an AI service and stored privately until you choose to delete it. You can permanently delete your notice and all files at any time with one click.
                                        </p>
                                      </div>
                                  </div>
      )}
                                </main>
                                );
}
