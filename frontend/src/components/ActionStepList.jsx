import React from "react";
import { EvidenceBadge } from "./EvidenceBadge";

export function ActionStepList({ steps = [], submissionChannel }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900">
          Action Steps (Sequential Instructions)
        </h3>
        <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">
          {steps.length} Step{steps.length === 1 ? "" : "s"}
        </span>
      </div>

      {submissionChannel && submissionChannel.value && (
        <div className="mb-5 p-3.5 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
              Official Submission Channel
            </span>
            <p className="text-sm font-semibold text-blue-950 mt-0.5">
              {submissionChannel.value}
            </p>
          </div>
          <EvidenceBadge evidence={submissionChannel.evidence} status={submissionChannel.status} />
        </div>
      )}

      {steps.length === 0 ? (
        <p className="text-sm text-slate-500">No specific action steps derived from the notice.</p>
      ) : (
        <ol className="relative border-l border-slate-200 ml-3 space-y-6 py-2">
          {steps.map((step, idx) => (
            <li key={idx} className="ml-6">
              <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-emerald-600 rounded-full ring-4 ring-white text-xs font-bold text-white">
                {step.order || idx + 1}
              </span>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900 leading-relaxed">
                    {step.text}
                  </p>
                  <div className="self-end sm:self-auto shrink-0">
                    <EvidenceBadge evidence={step.evidence} status={step.status} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
