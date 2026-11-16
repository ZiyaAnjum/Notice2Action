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
      className="fixed inset-0 z-50 overflow-y-auto bg-charcoal-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
        <div className="bg-white rounded-3xl max-w-md w-full border border-stone-200/90 shadow-elevated overflow-hidden">
          {/* Header */}
            <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-coral-50/70">
              <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-coral-700" aria-hidden="true" />
                  <h2 id="delete-confirm-title" className="text-base sm:text-lg font-black text-coral-950">
                    Delete Notice
                  </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                aria-label="Close delete dialog"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
                <div className="p-5 sm:p-6 space-y-3 text-stone-700">
                  <p className="font-extrabold text-stone-900 text-sm sm:text-base">
                    Are you sure you want to permanently delete:
                  </p>
                    <p className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 font-mono text-xs sm:text-sm break-all font-bold">
                      {title || "This notice"}
                    </p>
                      <p className="text-xs sm:text-sm text-stone-600 font-medium leading-relaxed">
                        This will permanently erase the notice, stored PDF file, checklist updates, and reminders. This action cannot be undone.
                      </p>

                        <div className="pt-3 flex items-center justify-end gap-2.5">
                          <button
                            type="button"
                            onClick={onClose}
                            disabled={isDeleting}
                            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 min-h-[40px]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={onConfirm}
                            disabled={isDeleting}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black text-white bg-coral-600 hover:bg-coral-700 disabled:opacity-50 min-h-[40px] shadow-xs"
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
