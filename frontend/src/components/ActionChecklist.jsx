import { useState, useEffect } from "react";
import { CheckSquare, Square, FileText, AlertTriangle, MapPin } from "lucide-react";

export function ActionChecklist({
  steps = [],
  whereToSubmit = [],
  noticeId = "",
  onShowSource = null,
}) {
  // Filter out any invalid steps with empty text
  const validSteps = steps.filter(
    (s) => s && typeof s.text === "string" && s.text.trim().length > 0
  );

  const storageKey = `n2a_checklist_${noticeId || "default"}`;

  const [checkedMap, setCheckedMap] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(checkedMap));
    } catch {
      // localStorage may fail in private mode
    }
  }, [checkedMap, storageKey]);

  if (validSteps.length === 0) {
    return null;
  }

  const toggleStep = (key) => {
    setCheckedMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const totalSteps = validSteps.length;
  const completedCount = validSteps.filter(
    (step, idx) => checkedMap[step.id || step.order || idx]
  ).length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  // Format where_to_submit as a clean short summary sub-line
  const whereText = Array.isArray(whereToSubmit)
    ? whereToSubmit
        .map((w) => {
          if (!w) return null;
          if (typeof w === "string") return w;
          const parts = [w.channel, w.details].filter(Boolean);
          return parts.join(": ");
        })
        .filter(Boolean)
        .join(" • ")
    : typeof whereToSubmit === "string"
    ? whereToSubmit
    : null;

  return (
    <section
      aria-labelledby="checklist-heading"
      className="bg-white border-2 border-slate-300 rounded-3xl p-6 sm:p-8 shadow-xs space-y-5"
    >
      {/* Header with Title and Progress Count */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 id="checklist-heading" className="text-xl sm:text-2xl font-black text-navy-950">
            What to do
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-0.5">
            Key action steps required by this notice. Check items as you complete them.
          </p>
        </div>

        {/* Progress Badge and Mini Bar */}
        <div className="flex items-center gap-3">
          <span
            role="status"
            aria-live="polite"
            className="px-3 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-900 border border-purple-200"
          >
            {completedCount} of {totalSteps} done
          </span>
          <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
            <div
              className="h-full bg-purple-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Checklist items list */}
      <ul className="space-y-3.5 list-none m-0 p-0" role="list">
        {validSteps.map((step, idx) => {
          const stepKey = step.id || step.order || idx;
          const isDone = !!checkedMap[stepKey];
          const hasUncertainty =
            step.evidence && step.evidence.verified === false;
          const hasSource =
            step.evidence && (step.evidence.page || step.evidence.quote);

          return (
            <li
              key={stepKey}
              className={`p-4 rounded-2xl border transition-all ${
                isDone
                  ? "bg-slate-50/80 border-slate-200 text-slate-500"
                  : "bg-white border-slate-200 hover:border-purple-300 shadow-xs"
              }`}
            >
              <div className="flex items-start gap-3.5">
                {/* Checkbox button (touch target >= 44px) */}
                <button
                  type="button"
                  onClick={() => toggleStep(stepKey)}
                  aria-label={isDone ? `Mark step ${idx + 1} as incomplete` : `Mark step ${idx + 1} as completed`}
                  aria-pressed={isDone}
                  className="flex-shrink-0 mt-0.5 p-1 -m-1 rounded-lg text-purple-700 hover:text-purple-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
                >
                  {isDone ? (
                    <CheckSquare className="w-6 h-6 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Square className="w-6 h-6 text-slate-400 hover:text-purple-600" aria-hidden="true" />
                  )}
                </button>

                {/* Step content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p
                      className={`text-sm sm:text-base font-bold leading-snug break-words ${
                        isDone ? "line-through text-slate-500" : "text-navy-950"
                      }`}
                    >
                      {step.text}
                    </p>

                    {/* Field-level uncertainty indicator */}
                    {hasUncertainty && (
                      <span
                        title="Supporting quote could not be verified verbatim against extracted document text"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex-shrink-0"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-800" aria-hidden="true" />
                        <span>Verify against notice</span>
                      </span>
                    )}

                    {/* Source citation button */}
                    {hasSource && onShowSource && (
                      <button
                        type="button"
                        onClick={() => onShowSource(step.evidence.page, step.evidence.quote)}
                        aria-label={`View source citation on page ${step.evidence.page || 1}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline min-h-[32px] px-1.5 py-0.5 rounded focus:outline-hidden focus:ring-2 focus:ring-purple-600 flex-shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Source {step.evidence.page ? `p.${step.evidence.page}` : ""}</span>
                      </button>
                    )}
                  </div>

                  {/* Submission channel sub-line under the first relevant action step */}
                  {idx === 0 && whereText && (
                    <div className="flex items-start gap-1.5 pt-1 text-xs font-medium text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                      <MapPin className="w-3.5 h-3.5 text-purple-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="break-words">
                        <strong className="text-navy-950">Where: </strong>
                        {whereText}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

