import { useEffect } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export function DeleteConfirmModal({ title, isOpen, onClose, onConfirm, isDeleting }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-elevated overflow-hidden ui-fade-in">
        {/* Header */}
        <div className="p-5 border-b border-rose-100 flex items-center justify-between bg-rose-50/70">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </span>
            <h2 id="delete-confirm-title" className="text-base font-extrabold text-navy-950">
              Delete Document
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white/80 disabled:opacity-50"
            aria-label="Close delete dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3.5 text-slate-700">
          <p className="font-bold text-navy-950 text-sm">
            Are you sure you want to permanently delete:
          </p>
          <p className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-navy-950 font-mono text-xs break-all font-semibold">
            {title || "This notice"}
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            This will permanently erase the document, stored PDF file, extracted checklist updates, and reminders. This action cannot be undone.
          </p>

          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="focus-ring px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="focus-ring inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 min-h-[40px] shadow-xs transition"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isDeleting ? "Deleting..." : "Permanently Delete"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
