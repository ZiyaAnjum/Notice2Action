import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileText, AlertCircle, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
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
        // Continue polling unless catastrophic
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
        // Immediate final status
        navigate(`/notices/${uploadRes.id}`);
        return;
      }
      // Poll until processed or terminal status
      pollNoticeStatus(uploadRes.id);
    } catch (err) {
      setIsProcessing(false);
      setErrorMessage(err.message || "Failed to upload notice. Please try again.");
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Page Title */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
          Upload Your Notice
        </h1>
        <p className="text-base sm:text-lg text-slate-600 font-medium max-w-xl mx-auto">
          We extract every deadline, required document, and action step so you know exactly what to do next.
        </p>
      </div>

      {/* Processing State Banner */}
      {isProcessing && (
        <div
          role="status"
          aria-live="polite"
          className="bg-indigo-50 border-2 border-indigo-300 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-sm"
        >
          <div className="flex justify-center">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{statusMessage}</h2>
            <p className="text-sm text-slate-600 mt-1">
              Extracting text and identifying deadlines, checklist items, and requirements...
            </p>
          </div>
          <div className="max-w-xs mx-auto bg-slate-200 rounded-full h-2 overflow-hidden">
            <div className="bg-indigo-600 h-full animate-pulse w-3/4 rounded-full" />
          </div>
        </div>
      )}

      {/* Polling Timeout State */}
      {pollTimedOut && (
        <div
          role="alert"
          className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-6 sm:p-8 text-center space-y-4"
        >
          <AlertCircle className="w-10 h-10 text-amber-700 mx-auto" />
          <div>
            <h2 className="text-xl font-bold text-amber-950">
              Processing is taking longer than expected
            </h2>
            <p className="text-sm text-amber-900 mt-1">
              Your notice is still processing in the background. You can open its dashboard now or check it on the past notices page.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {currentNoticeId && (
              <button
                type="button"
                onClick={() => navigate(`/notices/${currentNoticeId}`)}
                className="px-5 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 min-h-[44px]"
              >
                Open Dashboard
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/notices")}
              className="px-5 py-2.5 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 min-h-[44px]"
            >
              Go to Past Notices
            </button>
          </div>
        </div>
      )}

      {/* Main Upload Area */}
      {!isProcessing && !pollTimedOut && (
        <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-sm">Upload could not proceed</p>
                <p className="text-sm mt-0.5">{errorMessage}</p>
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
            className={`border-3 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 focus-within:ring-4 focus-within:ring-indigo-600 ${
              dragActive
                ? "border-indigo-600 bg-indigo-50/70"
                : selectedFile
                ? "border-emerald-500 bg-emerald-50/40"
                : "border-slate-300 hover:border-indigo-400 bg-slate-50/60"
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
                <p className="text-lg font-extrabold text-slate-900">{selectedFile.name}</p>
                <p className="text-xs font-semibold text-slate-500">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="text-xs font-bold text-indigo-600 underline hover:text-indigo-800 pt-1"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <UploadCloud className="w-12 h-12 text-indigo-600 mx-auto" />
                <p className="text-lg font-bold text-slate-900">
                  Drag and drop your PDF notice here
                </p>
                <p className="text-sm text-slate-500">
                  or <span className="text-indigo-600 font-extrabold underline">browse your files</span>
                </p>
                <p className="text-xs font-medium text-slate-400 pt-2">
                  PDF format only • Maximum file size 10MB
                </p>
              </div>
            )}
          </div>

          {/* Action button */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!selectedFile}
              onClick={handleSubmit}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-black text-base text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md focus:outline-hidden focus:ring-4 focus:ring-indigo-600 min-h-[48px]"
            >
              <FileText className="w-5 h-5" aria-hidden="true" />
              <span>Read Notice &amp; Build Action Plan</span>
            </button>
          </div>

          {/* Privacy Note */}
          <div className="pt-4 border-t border-slate-200 flex items-start gap-3 text-xs sm:text-sm text-slate-600">
            <ShieldCheck className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              <strong className="text-slate-900">Privacy Guarantee:</strong> Your notice is processed securely by an AI service and stored privately until you choose to delete it. You can permanently delete your notice and all files at any time with one click.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
