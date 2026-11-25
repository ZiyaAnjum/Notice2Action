import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  AlertCircle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  FileCheck,
  Clock,
  ArrowRight,
  X,
  Camera,
  Sparkles,
} from "lucide-react";
import { uploadNotice, getNotice } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { CameraCaptureModal } from "../components/CameraCaptureModal";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60000;

export function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [currentNoticeId, setCurrentNoticeId] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  useEffect(
    () => () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    },
    []
  );

  const validateFile = (file) => {
    if (!file) return "Please select a PDF file.";

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return "Only PDF files are supported. Please select a valid PDF notice.";
    }
    if (file.size === 0) {
      return "The selected file is empty. Please upload a valid PDF document.";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return "This file is larger than 10MB. Please upload a PDF under 10MB.";
    }
    return null;
  };

  const selectFile = (file) => {
    setErrorMessage(null);
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) selectFile(file);
  };

  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) selectFile(file);
  };

  const removeSelectedFile = (event) => {
    event.stopPropagation();
    setSelectedFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const pollNoticeStatus = (noticeId) => {
    setCurrentNoticeId(noticeId);
    const startTime = Date.now();

    pollTimerRef.current = setInterval(async () => {
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
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
          if (detail.status === "failed" || detail.status === "extraction_failed") {
            setIsProcessing(false);
            let friendlyError =
              detail.error ||
              detail.message ||
              "Document processing failed. Please try again.";
            if (/gemini|status\s*\d{3}|proto|api\s*key|syntaxerror|read\s*timeout|exception|httpx/i.test(friendlyError)) {
              if (/429|quota|daily\s*limit|resource_exhausted/i.test(friendlyError)) {
                friendlyError = "The AI service is busy or its daily limit was reached. Please try again later.";
              } else {
                friendlyError = "The AI extraction service encountered an issue analyzing this document. Please try again in a few moments.";
              }
            }
            setErrorMessage(friendlyError);
            return;
          }
          setStatusMessage("Reading complete! Opening dashboard...");
          setTimeout(() => navigate(`/notices/${noticeId}`), 400);
        }
      } catch (pollError) {
        console.warn("Polling check error:", pollError);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Please choose a PDF notice file first.");
      return;
    }

    setErrorMessage(null);
    setPollTimedOut(false);
    setIsProcessing(true);
    setStatusMessage("Reading your notice...");

    try {
      const uploadResponse = await uploadNotice(selectedFile);
      if (uploadResponse.status && uploadResponse.status !== "processing") {
        navigate(`/notices/${uploadResponse.id}`);
        return;
      }
      pollNoticeStatus(uploadResponse.id);
    } catch (error) {
      setIsProcessing(false);
      setErrorMessage(error.message || "Failed to upload notice. Please try again.");
    }
  };

  const handlePhotosCaptured = async (photoFiles) => {
    setIsCameraOpen(false);
    if (!photoFiles || photoFiles.length === 0) return;

    setErrorMessage(null);
    setPollTimedOut(false);
    setIsProcessing(true);
    setStatusMessage("Reading your captured notice photos...");

    try {
      const uploadResponse = await uploadNotice(photoFiles);
      if (uploadResponse.status && uploadResponse.status !== "processing") {
        navigate(`/notices/${uploadResponse.id}`);
        return;
      }
      pollNoticeStatus(uploadResponse.id);
    } catch (error) {
      setIsProcessing(false);
      setErrorMessage(error.message || "Failed to upload notice photos. Please try again.");
    }
  };

  return (
    <main className="page-shell max-w-4xl space-y-6">
      <PageHeader
        icon={UploadCloud}
        eyebrow="Intelligent Document Intake"
        title="Upload Notice or Circular"
        description="Submit institutional circulars, scholarship announcements, exam schedules, or fee notices. The AI action engine extracts summaries, important dates, and required documents."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3.5 text-xs font-bold text-purple-900 hover:bg-purple-100 shadow-xs transition"
            >
              <Camera className="h-4 w-4 text-purple-700" aria-hidden="true" />
              <span>Take Photo</span>
            </button>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 text-xs font-bold text-purple-800 shadow-xs">
              <FileCheck className="h-3.5 w-3.5" aria-hidden="true" />
              PDF Analysis
            </span>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 text-xs font-bold text-cyan-900 shadow-xs">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Deadline Extraction
            </span>
          </div>
        }
      />

      {/* Feature Information Cards */}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Upload information">
        <article className="surface-card p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Source Recognition</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 font-medium">
            Automatically identifies issuing authority, college departments, or exam boards.
          </p>
        </article>
        <article className="surface-card p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Action Plan</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 font-medium">
            Generates step-by-step checklist and document verification requirements.
          </p>
        </article>
        <article className="surface-card border-purple-200 bg-purple-50/50 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-800">Supported Formats</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-700 font-medium">
            Accepts PDF documents (up to 10 MB) or captured photos (up to 10 pages).
          </p>
        </article>
      </section>

      {/* Processing State */}
      {isProcessing && (
        <section
          role="status"
          aria-live="polite"
          className="surface-card border-2 border-purple-500 rounded-3xl p-8 sm:p-12 text-center space-y-6 shadow-elevated ui-fade-in"
        >
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-purple-200 animate-ping opacity-60" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-700 to-purple-600 text-white flex items-center justify-center shadow-purple">
              <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
            </div>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-black text-navy-950 tracking-tight">
              {statusMessage}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Our AI engine is reading your notice. Dates, checklist items, and instructions will be compiled into your action dashboard.
            </p>
          </div>
          <div
            className="mx-auto h-2 max-w-md overflow-hidden rounded-full border border-purple-100 bg-purple-50"
            role="progressbar"
            aria-label="Notice processing"
          >
            <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-purple-600 to-cyan-400" />
          </div>
        </section>
      )}

      {/* Processing Failed / Timeout State */}
      {pollTimedOut && (
        <section
          role="alert"
          className="rounded-3xl border-2 border-rose-300 bg-rose-50 p-6 sm:p-8 text-center space-y-4 shadow-card ui-fade-in"
        >
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" aria-hidden="true" />
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-rose-950">
              Document processing could not complete
            </h2>
            <p className="text-xs sm:text-sm text-rose-900 mt-1.5 max-w-lg mx-auto leading-relaxed">
              {errorMessage || "Document processing timed out or encountered an issue. Please try uploading again."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setPollTimedOut(false);
                setErrorMessage(null);
                setSelectedFile(null);
                setCapturedPhotos([]);
                setIsProcessing(false);
              }}
              className="px-6 py-2.5 rounded-xl font-black text-white bg-purple-600 hover:bg-purple-700 shadow-md min-h-[44px]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => navigate("/notices")}
              className="btn-secondary"
            >
              Go to Notices Library
            </button>
          </div>
        </section>
      )}

      {/* Normal Upload Form */}
      {!isProcessing && !pollTimedOut && (
        <section className="surface-card p-6 sm:p-8 space-y-6">
          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 flex items-start justify-between gap-3 ui-fade-in"
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="w-5 h-5 text-rose-600 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-bold text-sm">Upload or Processing Notice</p>
                  <p className="text-xs mt-0.5 text-rose-800 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setSelectedFile(null);
                  setCapturedPhotos([]);
                }}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-200 hover:bg-rose-300 text-rose-900 font-bold text-xs"
              >
                Try again
              </button>
            </div>
          )}

          {/* Drag & Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            role="region"
            aria-label="PDF upload drop zone"
            aria-describedby="upload-instructions"
            className={`group relative rounded-3xl border-2 border-dashed p-8 sm:p-12 text-center transition-all ${dragActive
              ? "border-purple-600 bg-purple-50/70 scale-[1.01]"
              : selectedFile
                ? "border-emerald-500 bg-emerald-50/50"
                : "border-slate-300 hover:border-purple-400 bg-slate-50/60 hover:bg-slate-50"
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              onClick={(event) => event.stopPropagation()}
              className="sr-only"
              id="notice-file-input"
              aria-label="Upload notice PDF"
            />

            {selectedFile ? (
              <div className="space-y-3.5 max-w-md mx-auto ui-fade-in">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-extrabold text-navy-950 break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 mt-1">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready to read
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="text-xs font-bold text-purple-700 underline hover:text-purple-900"
                  >
                    Choose a different file
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedFile}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-600 transition"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    Remove file
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-cyan-50 text-purple-700 border border-purple-200/80 flex items-center justify-center mx-auto group-hover:scale-105 transition shadow-sm">
                  <UploadCloud className="w-8 h-8" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-extrabold text-navy-950 tracking-tight">
                    Drag and drop your notice PDF here
                  </p>
                  <p id="upload-instructions" className="text-xs text-slate-500 mt-1">
                    <span>or </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="focus-ring rounded font-bold text-purple-700 underline hover:text-purple-900"
                    >
                      browse your local files
                    </button>
                  </p>
                </div>
                <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsCameraOpen(true);
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 px-4 py-2 text-xs sm:text-sm font-bold text-purple-900 shadow-2xs transition"
                  >
                    <Camera className="w-4 h-4 text-purple-700" aria-hidden="true" />
                    <span>Take Photo</span>
                  </button>
                </div>
                <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  PDF format (up to 10MB) or Photo Capture (up to 10 pages)
                </span>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            <span className="text-xs text-slate-500 font-medium">
              Upload a PDF notice or take photos of a paper notice to process.
            </span>
            <button
              type="button"
              disabled={!selectedFile}
              onClick={handleSubmit}
              className="btn-primary w-full sm:w-auto"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Read Notice &amp; Build Action Plan</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Disclaimer / Grounding Callout */}
          <div className="pt-4 border-t border-slate-100 flex items-start gap-3 text-xs text-slate-600 bg-slate-50/70 p-4 rounded-2xl">
            <ShieldCheck
              className="w-5 h-5 text-purple-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="leading-relaxed">
              Extraction is assistive, not authoritative. Always verify critical dates, fee amounts, and requirements against the original source notice before taking action.
            </p>
          </div>
        </section>
      )}

      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onComplete={handlePhotosCaptured}
      />
    </main>
  );
}
