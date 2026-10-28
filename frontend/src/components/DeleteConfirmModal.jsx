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
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      <div className="bg-white rounded-2xl max-w-md w-full border-2 border-slate-300 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-rose-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-700" aria-hidden="true" />
            <h2 id="delete-confirm-title" className="text-lg font-bold text-rose-950">
              Delete Notice
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 disabled:opacity-50"
            aria-label="Close delete dialog"
          >
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-3 text-slate-700">
          <p className="font-semibold text-slate-900 text-base">
            Are you sure you want to permanently delete:
          </p>
          <p className="p-3 bg-slate-100 rounded-xl text-slate-900 font-mono text-sm break-all font-semibold">
            {title || "This notice"}
          </p>
          <p className="text-sm text-slate-600">
            This will permanently erase the notice, stored PDF file, checklist updates, and reminders. This action cannot be undone.
          </p>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2.5 rounded-xl font-bold text-slate-700 hover:bg-slate-100 border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 focus:outline-hidden focus:ring-2 focus:ring-rose-600 shadow-sm disabled:opacity-50 min-h-[44px]"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isDeleting ? "Deleting..." : "Yes, Delete Notice"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
