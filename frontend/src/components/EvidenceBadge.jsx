import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

export function EvidenceBadge({ evidence, status = "found" }) {
  const [isOpen, setIsOpen] = useState(false);

  if (status === "not_found" || !evidence || !evidence.quote) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
        Not found in notice
      </span>
    );
  }

  const isUncertain = status === "uncertain" || status === "ambiguous" || status === "conflicting";

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`focus-ring inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold transition border ${
          isUncertain
            ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
            : "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100"
        }`}
        title="Click to view supporting quotation from original document"
      >
        <span>Page {evidence.page || "?"}</span>
        <span className="underline decoration-dotted">See in notice</span>
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-2 w-80 p-4 bg-white rounded-2xl shadow-elevated border border-slate-200 text-xs text-slate-700 left-0 ui-fade-in">
          <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-2 font-bold text-navy-950">
            <span>Source Grounding (Page {evidence.page})</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 rounded p-1"
              aria-label="Close popover"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <blockquote className="italic bg-slate-50 p-2.5 rounded-xl border-l-2 border-purple-600 font-mono text-[11px] text-navy-950 leading-relaxed">
            &ldquo;{evidence.quote}&rdquo;
          </blockquote>
          {isUncertain && (
            <p className="mt-2 text-amber-800 font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>Status is marked as {status}. Inspect original notice.</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
