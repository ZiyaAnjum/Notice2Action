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
  Clock,
  ArrowRight,
  X,
  Camera,
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
      return "Only PDF files are supported. Please select a PDF communication.";
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
    <main className="page-shell max-w-5xl space-y-6">
      <PageHeader
        icon={UploadCloud}
        eyebrow="Document intake"
        title="Upload a notice or document"
        description="Bring a communication from any organisation into one workspace. The connected service can extract its summary, key dates, and potential next steps for review."
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3.5 text-xs font-semibold text-purple-900 hover:bg-purple-100 shadow-xs transition"
            >
              <Camera className="h-4 w-4 text-purple-700" aria-hidden="true" />
              <span>Take Photo</span>
            </button>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-xs">
              <FileCheck className="h-3.5 w-3.5 text-purple-700" aria-hidden="true" />
              PDF analysis
            </span>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-xs">
              <Clock className="h-3.5 w-3.5 text-purple-700" aria-hidden="true" />
              Deadline review
            </span>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Upload information">
        <article className="surface-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Source organisation</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">Shown in details when it is returned by document extraction.</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Document category</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">Assigned by the current processor when it recognises a supported category.</p>
        </article>
        <article className="surface-card border-cyan-100 bg-cyan-50/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-900">Current upload integration</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">Accepts PDF files (up to 10 MB) or captured photos (up to 10 pages).</p>
        </article>
      </section>

      {isProcessing && (
        <section
          role="status"
          aria-live="polite"
          className="bg-white border-2 border-teal-500 rounded-3xl p-8 sm:p-10 text-center space-y-5 shadow-elevated"
        >
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-teal-100 animate-ping opacity-60" />
            <div className="relative w-16 h-16 rounded-2xl bg-teal-700 text-white flex items-center justify-center shadow-md">
              <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black text-stone-950 tracking-tight">
              {statusMessage}
            </h2>
            <p className="text-sm text-stone-600 max-w-md mx-auto">
              The connected service is processing your document. Its extracted
              dates, checklist items, and requirements should be checked against
              the original.
            </p>
          </div>
          <div
            className="mx-auto h-2.5 max-w-md overflow-hidden rounded-full border border-purple-100 bg-purple-50"
            role="progressbar"
            aria-label="Notice processing"
          >
            <div className="h-full w-full animate-pulse rounded-full bg-purple-200" />
          </div>
        </section>
      )}

      {pollTimedOut && (
        <section
          role="alert"
          className="bg-amber-50 border-2 border-amber-400 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-card"
        >
          <AlertCircle className="w-10 h-10 text-amber-700 mx-auto" aria-hidden="true" />
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-amber-950">
              Processing is taking longer than expected
            </h2>
            <p className="text-sm text-amber-900 mt-1 max-w-lg mx-auto">
              Your document is still processing in the background. You can open
              its details now or check it in your document library.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {currentNoticeId && (
              <button
                type="button"
                onClick={() => navigate(`/notices/${currentNoticeId}`)}
                className="px-5 py-2.5 rounded-xl font-bold text-white bg-teal-700 hover:bg-teal-800 shadow-xs min-h-[44px]"
              >
                Open document
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/notices")}
              className="px-5 py-2.5 rounded-xl font-bold text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 min-h-[44px]"
            >
              Go to all documents
            </button>
          </div>
        </section>
      )}

      {!isProcessing && !pollTimedOut && (
        <section className="bg-white border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-elevated space-y-6">
          {errorMessage && (
            <div
              role="alert"
              className="p-4 sm:p-5 rounded-2xl bg-coral-50 border border-coral-300 text-coral-950 flex items-start gap-3.5"
            >
              <AlertCircle
                className="w-5 h-5 text-coral-600 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-bold text-sm">Upload could not proceed</p>
                <p className="text-sm mt-0.5 text-coral-900">{errorMessage}</p>
              </div>
            </div>
          )}

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            role="region"
            aria-label="PDF upload drop zone"
            aria-describedby="upload-instructions"
            className={`group relative rounded-3xl border-2 border-dashed p-8 sm:p-10 text-center transition-all duration-200 ${
              dragActive
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
              onClick={(event) => event.stopPropagation()}
              className="sr-only"
              id="notice-file-input"
              aria-label="Upload notice PDF"
            />

            {selectedFile ? (
              <div className="space-y-3 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-lg sm:text-xl font-black text-stone-950 break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-stone-500 mt-1">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready
                    to upload
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-4">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="text-xs sm:text-sm font-bold text-teal-700 underline hover:text-teal-900"
                  >
                    Choose a different file
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedFile}
                    className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-stone-600 hover:text-stone-900"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                    Remove file
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200/70 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-8 h-8" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-lg sm:text-xl font-black text-stone-900 tracking-tight">
                    Drag and drop your PDF document here
                  </p>
                  <p id="upload-instructions" className="text-sm text-stone-500 mt-1">
                    <span className="mx-1">or</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="focus-ring rounded font-bold text-purple-700 underline hover:text-purple-900"
                    >
                      browse your files
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
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-600">
                  PDF format (up to 10MB) or Photo Capture (up to 10 pages)
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
            <span className="text-xs text-stone-500 font-medium">
              Upload a PDF notice or take photos of a paper notice to process.
            </span>
            <button
              type="button"
              disabled={!selectedFile}
              onClick={handleSubmit}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl font-bold text-sm text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all focus:outline-hidden focus:ring-4 focus:ring-teal-600/30 min-h-[48px]"
            >
              <FileText className="w-5 h-5" aria-hidden="true" />
              <span>Read Notice &amp; Build Action Plan</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="pt-5 border-t border-stone-100 flex items-start gap-3 text-xs sm:text-sm text-stone-600 bg-stone-50/70 p-4 rounded-2xl">
            <ShieldCheck
              className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="leading-relaxed">
              Extraction is not independent verification. Review dates,
              requirements, and source details against the original document
              before acting.
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
