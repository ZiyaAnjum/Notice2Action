import { useState } from "react";

export function EvidenceBadge({ evidence, status = "found" }) {
  const [isOpen, setIsOpen] = useState(false);

  if (status === "not_found" || !evidence || !evidence.quote) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
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
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors border ${
          isUncertain
            ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
            : "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
        }`}
        title="Click to view supporting quotation from original document"
      >
        <span>Page {evidence.page || "?"}</span>
        <span className="underline decoration-dotted">See in notice</span>
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-2 w-80 p-3 bg-white rounded-lg shadow-xl border border-slate-200 text-xs text-slate-700 left-0">
          <div className="flex justify-between items-center mb-1.5 border-b pb-1 font-semibold text-slate-800">
            <span>Source Grounding (Page {evidence.page})</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 font-bold px-1"
            >
              ×
            </button>
          </div>
          <blockquote className="italic bg-slate-50 p-2 rounded border-l-2 border-emerald-500 font-mono text-[11px] text-slate-800">
            &ldquo;{evidence.quote}&rdquo;
          </blockquote>
          {isUncertain && (
            <p className="mt-2 text-amber-700 font-medium">
              ⚠ Caution: Status is marked as {status}. Please inspect the original notice file.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
