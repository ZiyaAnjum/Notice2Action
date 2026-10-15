import React from "react";
import { EvidenceBadge } from "./EvidenceBadge";

export function DocumentChecklist({ documents = [] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900">
          Required Documents Checklist
        </h3>
        <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">
          {documents.length} item{documents.length === 1 ? "" : "s"}
        </span>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-slate-500">No document requirements mentioned in this notice.</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc, idx) => (
            <li
              key={idx}
              className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id={`doc-${idx}`}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor={`doc-${idx}`} className="text-sm font-medium text-slate-900 cursor-pointer">
                  {doc.name}
                  {doc.explicitly_required ? (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      Mandatory
                    </span>
                  ) : (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      Not required by the notice (Optional)
                    </span>
                  )}
                </label>
              </div>
              <div className="self-end sm:self-auto">
                <EvidenceBadge evidence={doc.evidence} status={doc.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
