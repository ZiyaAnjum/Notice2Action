import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  X,
  RotateCcw,
  Check,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Upload,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";

const MAX_PAGES = 10;
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

/**
 * Compress and resize an HTMLVideoElement or HTMLImageElement via an offscreen canvas.
 */
function compressMedia(source, maxDim = MAX_DIMENSION, quality = JPEG_QUALITY) {
  let width = source.videoWidth || source.naturalWidth || source.width || 800;
  let height = source.videoHeight || source.naturalHeight || source.height || 600;

  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({ blob, dataUrl });
      },
      "image/jpeg",
      quality
    );
  });
}

export function CameraCaptureModal({ isOpen, onClose, onComplete }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fallbackInputRef = useRef(null);

  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [capturedPages, setCapturedPages] = useState([]);
  const [isProcessingShot, setIsProcessingShot] = useState(false);

  // Stop active media stream tracks safely
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore cleanup errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    stopStream();
    setCameraError(null);

    // 1. Check secure context (HTTPS or localhost required for getUserMedia)
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setCameraError(
        "Camera access requires a secure connection (HTTPS or localhost). Please use the photo file picker below."
      );
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Your browser does not support live camera access. Please upload or take a photo using the button below."
      );
      return;
    }

    try {
      // Prefer rear camera on mobile
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (rearErr) {
        // Fallback to any available video stream
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreamActive(true);
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError(
          "Camera permission was denied. Please allow camera permissions in your browser or select an image file below."
        );
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError(
          "No camera hardware was detected on your device. You can still upload a photo file below."
        );
      } else {
        setCameraError(
          `Unable to start camera stream (${err.message || "Unknown error"}). Please use the photo file picker below.`
        );
      }
    }
  }, [stopStream]);

  // Start camera on modal open; stop on close
  useEffect(() => {
    if (isOpen) {
      setPreviewPhoto(null);
      setCapturedPages([]);
      startCamera();
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, startCamera, stopStream]);

  // Capture current video frame
  const handleCapture = async () => {
    if (!videoRef.current || !streamActive) return;
    setIsProcessingShot(true);
    try {
      const { blob, dataUrl } = await compressMedia(videoRef.current);
      setPreviewPhoto({
        id: `shot-${Date.now()}`,
        dataUrl,
        blob,
        filename: `notice_page_${capturedPages.length + 1}.jpg`,
      });
    } catch (err) {
      setCameraError("Failed to capture photo frame. Please try again.");
    } finally {
      setIsProcessingShot(false);
    }
  };

  // Confirm current shot and add to captured pages
  const handleUseCurrentPhoto = () => {
    if (!previewPhoto) return;
    const newPages = [...capturedPages, previewPhoto];
    setCapturedPages(newPages);
    setPreviewPhoto(null);

    // If max pages reached, stop camera
    if (newPages.length >= MAX_PAGES) {
      stopStream();
    }
  };

  // Discard preview shot and return to live stream
  const handleRetake = () => {
    setPreviewPhoto(null);
    if (!streamActive) {
      startCamera();
    }
  };

  // Fallback file input change (for devices where getUserMedia fails)
  const handleFallbackFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingShot(true);
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objectUrl;
      });

      const { blob, dataUrl } = await compressMedia(img);
      URL.revokeObjectURL(objectUrl);

      setPreviewPhoto({
        id: `shot-${Date.now()}`,
        dataUrl,
        blob,
        filename: `notice_page_${capturedPages.length + 1}.jpg`,
      });
    } catch {
      setCameraError("Failed to load photo. Please ensure it is a valid JPEG/PNG image.");
    } finally {
      setIsProcessingShot(false);
      if (fallbackInputRef.current) fallbackInputRef.current.value = "";
    }
  };

  // Multi-page manipulation: delete
  const handleDeletePage = (index) => {
    const next = capturedPages.filter((_, i) => i !== index);
    setCapturedPages(next);
  };

  // Multi-page manipulation: move left
  const handleMoveLeft = (index) => {
    if (index <= 0) return;
    const next = [...capturedPages];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setCapturedPages(next);
  };

  // Multi-page manipulation: move right
  const handleMoveRight = (index) => {
    if (index >= capturedPages.length - 1) return;
    const next = [...capturedPages];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setCapturedPages(next);
  };

  // Submit all captured pages to parent
  const handleFinalSubmit = () => {
    if (capturedPages.length === 0) return;
    const files = capturedPages.map((page, idx) => {
      return new File([page.blob], `notice_page_${idx + 1}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    });
    stopStream();
    onComplete(files);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="relative flex flex-col w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-3xl bg-navy-900 border border-white/10 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-navy-950/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600/30 text-purple-300 border border-purple-500/30">
              <Camera className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="camera-modal-title" className="text-sm sm:text-base font-extrabold text-white">
                Take Notice Photo
              </h2>
              <p className="text-[11px] text-slate-400">
                {capturedPages.length > 0
                  ? `${capturedPages.length} of ${MAX_PAGES} pages captured`
                  : "Position the document flat and well-lit"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            aria-label="Close camera modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tips Guidance Strip */}
        <div className="px-4 py-2 bg-navy-950/90 border-b border-white/5 text-center">
          <p className="text-[11px] font-medium text-slate-300">
            <span className="font-bold text-purple-300">Tips:</span> Flat surface · Good lighting · Fill the frame · Hold steady
          </p>
        </div>

        {/* Viewport Area */}
        <div className="relative flex-1 min-h-[300px] sm:min-h-[380px] bg-black flex items-center justify-center overflow-hidden">
          {/* Live Video Preview */}
          {!previewPhoto && !cameraError && (
            <>
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="w-full h-full object-contain max-h-[55vh]"
              />
              {/* Framing Guide Overlay with Corner Brackets */}
              <div
                className="absolute inset-6 sm:inset-10 pointer-events-none border border-white/20 rounded-2xl flex flex-col justify-between p-2"
                aria-hidden="true"
              >
                <div className="flex justify-between">
                  <div className="w-5 h-5 border-t-2 border-l-2 border-purple-400 rounded-tl-sm" />
                  <div className="w-5 h-5 border-t-2 border-r-2 border-purple-400 rounded-tr-sm" />
                </div>
                <div className="flex justify-between">
                  <div className="w-5 h-5 border-b-2 border-l-2 border-purple-400 rounded-bl-sm" />
                  <div className="w-5 h-5 border-b-2 border-r-2 border-purple-400 rounded-br-sm" />
                </div>
              </div>
            </>
          )}

          {/* Captured Single Photo Preview */}
          {previewPhoto && (
            <div className="relative w-full h-full flex items-center justify-center bg-black max-h-[55vh]">
              <img
                src={previewPhoto.dataUrl}
                alt="Captured document page preview"
                className="max-h-[55vh] w-full object-contain"
              />
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-xs text-xs px-3 py-1.5 rounded-full border border-white/10 font-bold">
                Photo Preview
              </div>
            </div>
          )}

          {/* Camera Error State with Fallback Input */}
          {cameraError && !previewPhoto && (
            <div className="flex flex-col items-center justify-center p-6 text-center max-w-md space-y-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <AlertCircle className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">Live Camera Unavailable</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-300">{cameraError}</p>
              </div>

              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-purple-600 px-5 text-xs font-bold text-white hover:bg-purple-700 transition"
              >
                <Upload className="h-4 w-4" />
                <span>Upload Photo or Use Device Camera</span>
              </button>

              <button
                type="button"
                onClick={startCamera}
                className="text-xs text-slate-400 hover:text-white underline pt-1"
              >
                Retry camera access
              </button>
            </div>
          )}

          {/* Fallback hidden file input */}
          <input
            ref={fallbackInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFallbackFileChange}
            className="hidden"
            aria-label="Upload photo from device"
          />

          {isProcessingShot && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
              <span className="text-xs font-bold text-white">Optimizing photo...</span>
            </div>
          )}
        </div>

        {/* Live Capture / Preview Actions Bar */}
        <div className="p-4 bg-navy-950 border-t border-white/10 flex items-center justify-between gap-3">
          {previewPhoto ? (
            /* Reviewing current shot */
            <div className="flex items-center justify-between w-full gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 text-xs font-bold text-slate-200 hover:bg-white/10 transition"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleUseCurrentPhoto}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-purple-600 px-5 text-xs font-bold text-white shadow-glow hover:bg-purple-700 transition"
              >
                <Check className="h-4 w-4" />
                <span>Use this photo</span>
              </button>
            </div>
          ) : (
            /* Live Stream Active: Capture Button */
            <div className="flex items-center justify-between w-full gap-3">
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
                title="Select photo from files"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">From device</span>
              </button>

              <button
                type="button"
                onClick={handleCapture}
                disabled={!streamActive || isProcessingShot}
                className="flex min-h-[48px] min-w-[48px] sm:px-6 sm:py-2.5 items-center justify-center gap-2 rounded-2xl bg-white text-navy-950 font-black text-xs hover:bg-purple-100 transition shadow-glow disabled:opacity-40"
                aria-label="Capture photo"
              >
                <div className="h-4 w-4 rounded-full border-2 border-navy-950 bg-purple-600" />
                <span className="hidden sm:inline">Capture Page</span>
              </button>

              <span className="text-[11px] text-slate-400">
                {capturedPages.length}/{MAX_PAGES}
              </span>
            </div>
          )}
        </div>

        {/* Multi-Page Carousel and Final Submission Row */}
        {capturedPages.length > 0 && (
          <div className="p-4 bg-navy-900 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-200">
                Captured Pages ({capturedPages.length})
              </p>
              {capturedPages.length < MAX_PAGES && !previewPhoto && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPhoto(null);
                    if (!streamActive) startCamera();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-400 hover:text-purple-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add another page</span>
                </button>
              )}
            </div>

            {/* Thumbnails Row */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
              {capturedPages.map((page, idx) => (
                <div
                  key={page.id}
                  className="relative group shrink-0 w-20 h-24 rounded-xl border border-white/15 bg-black overflow-hidden flex flex-col justify-between"
                >
                  <img
                    src={page.dataUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-between p-1">
                    <div className="flex items-center justify-between">
                      <span className="bg-black/70 text-[9px] px-1.5 py-0.5 rounded text-white font-mono font-bold">
                        P{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeletePage(idx)}
                        className="h-6 w-6 rounded bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center"
                        title="Delete page"
                        aria-label={`Delete page ${idx + 1}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Reorder arrows */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleMoveLeft(idx)}
                        disabled={idx === 0}
                        className="h-5 w-5 rounded bg-black/60 text-white disabled:opacity-30 flex items-center justify-center"
                        title="Move page earlier"
                        aria-label={`Move page ${idx + 1} earlier`}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveRight(idx)}
                        disabled={idx === capturedPages.length - 1}
                        className="h-5 w-5 rounded bg-black/60 text-white disabled:opacity-30 flex items-center justify-center"
                        title="Move page later"
                        aria-label={`Move page ${idx + 1} later`}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Final Action Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="w-full min-h-[46px] rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-glow flex items-center justify-center gap-2 transition"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  Process {capturedPages.length} {capturedPages.length === 1 ? "Page" : "Pages"}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
