import { useState, useEffect, useMemo } from "react";
import { CheckSquare, Square, FileText, AlertTriangle, MapPin, Info, ArrowRight } from "lucide-react";

export function ActionChecklist({
  steps = [],
  whereToSubmit = [],
  noticeId = "",
  onShowSource = null,
}) {
  // Filter out any invalid steps with empty text
  const validSteps = useMemo(() => {
    return (steps || []).filter(
      (s) => s && typeof s.text === "string" && s.text.trim().length > 0
    );
  }, [steps]);

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

  // Group steps by group_id; separate conditional steps into informational notes
  const { taskGroups, conditionalSteps } = useMemo(() => {
    const groups = [];
    const conditionals = [];
    const groupMap = new Map();

    const optionRegex = /^(?:Option|Method|Way)\s*\d+[:.-]?\s*/i;
    const condRegex = /^(?:If you have already paid|In case already paid|If paid|If this applies to you)/i;

    validSteps.forEach((step, idx) => {
      const rawType = (step.action_type || "").toLowerCase();
      const isOpt = optionRegex.test(step.text);
      const isCond = condRegex.test(step.text) || Boolean(step.condition);

      const actionType = (rawType === "conditional" || isCond)
        ? "conditional"
        : (rawType === "alternative" || isOpt)
        ? "alternative"
        : "required";

      if (actionType === "conditional") {
        conditionals.push({
          ...step,
          condition: step.condition || (step.text.toLowerCase().includes("already paid") ? "Only if you have already paid" : "Conditional step"),
        });
        return;
      }

      // Grouping logic for tasks & alternatives
      let groupId = step.group_id;
      let groupTitle = step.group_title;

      if (actionType === "alternative") {
        if (!groupId) groupId = "group_payment_options";
        if (!groupTitle) groupTitle = "Choose payment method / option";
      } else {
        if (!groupId) groupId = step.order != null ? step.order : (step.id || `task_${idx}`);
        if (!groupTitle) groupTitle = step.text;
      }

      if (!groupMap.has(groupId)) {
        const groupObj = {
          groupId,
          groupTitle,
          isAlternative: actionType === "alternative",
          steps: [step],
        };
        groupMap.set(groupId, groupObj);
        groups.push(groupObj);
      } else {
        const existing = groupMap.get(groupId);
        existing.steps.push(step);
        if (actionType === "alternative") {
          existing.isAlternative = true;
        }
      }
    });

    return { taskGroups: groups, conditionalSteps: conditionals };
  }, [validSteps]);

  if (validSteps.length === 0) {
    return null;
  }

  const isGroupDone = (group, map = checkedMap) => {
    return (
      !!map[group.groupId] ||
      group.steps.some(
        (s) => (s.order != null && !!map[s.order]) || (s.id != null && !!map[s.id])
      )
    );
  };

  const toggleGroup = (group) => {
    setCheckedMap((prev) => {
      const nextVal = !isGroupDone(group, prev);
      const updated = {
        ...prev,
        [group.groupId]: nextVal,
      };
      group.steps.forEach((s) => {
        if (s.order != null) updated[s.order] = nextVal;
        if (s.id != null) updated[s.id] = nextVal;
      });
      return updated;
    });
  };

  const totalTasks = taskGroups.length;
  const completedCount = taskGroups.filter((g) => isGroupDone(g)).length;
  const progressPercent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 100;

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
            Key action tasks required by this notice. Check off tasks as you complete them.
          </p>
        </div>

        {/* Progress Badge and Mini Bar (Counts tasks, not alternative options) */}
        <div className="flex items-center gap-3">
          <span
            role="status"
            aria-live="polite"
            className="px-3 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-900 border border-purple-200"
          >
            {completedCount} of {totalTasks} done
          </span>
          <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
            <div
              className="h-full bg-purple-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Task groups list */}
      <ul className="space-y-4 list-none m-0 p-0" role="list">
        {taskGroups.map((group, gIdx) => {
          const isDone = isGroupDone(group);
          const hasMultipleAlternatives = group.isAlternative || group.steps.length > 1;
          const firstStep = group.steps[0] || {};
          const hasUncertainty = group.steps.some(
            (s) => s.evidence && s.evidence.verified === false
          );
          const hasSource = group.steps.some(
            (s) => s.evidence && (s.evidence.page || s.evidence.quote)
          );

          return (
            <li
              key={group.groupId}
              className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                isDone
                  ? "bg-slate-50/80 border-slate-200 text-slate-500"
                  : "bg-white border-slate-200 hover:border-purple-300 shadow-xs"
              }`}
            >
              <div className="flex items-start gap-3.5">
                {/* Single Checkbox for entire task group */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-label={isDone ? `Mark step ${gIdx + 1} as incomplete (${group.groupTitle})` : `Mark step ${gIdx + 1} as completed (${group.groupTitle})`}
                  aria-pressed={isDone}
                  className="flex-shrink-0 mt-0.5 p-1 -m-1 rounded-lg text-purple-700 hover:text-purple-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
                >
                  {isDone ? (
                    <CheckSquare className="w-6 h-6 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Square className="w-6 h-6 text-slate-400 hover:text-purple-600" aria-hidden="true" />
                  )}
                </button>

                {/* Task content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p
                      className={`text-sm sm:text-base font-bold leading-snug break-words ${
                        isDone ? "line-through text-slate-500" : "text-navy-950"
                      }`}
                    >
                      {group.groupTitle}
                    </p>

                    {hasUncertainty && (
                      <span
                        title="Supporting quote could not be verified verbatim against extracted document text"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex-shrink-0"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-800" aria-hidden="true" />
                        <span>Verify against notice</span>
                      </span>
                    )}

                    {!hasMultipleAlternatives && hasSource && onShowSource && (
                      <button
                        type="button"
                        onClick={() => onShowSource(firstStep.evidence?.page, firstStep.evidence?.quote)}
                        aria-label={`View source citation on page ${firstStep.evidence?.page || 1}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline min-h-[32px] px-1.5 py-0.5 rounded focus:outline-hidden focus:ring-2 focus:ring-purple-600 flex-shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Source {firstStep.evidence?.page ? `p.${firstStep.evidence.page}` : ""}</span>
                      </button>
                    )}
                  </div>

                  {/* If alternatives exist: render as a clean "Choose one:" sub-list */}
                  {hasMultipleAlternatives && (
                    <div className="pt-1.5 space-y-2">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-purple-900">
                        Choose one option:
                      </p>
                      <div className="space-y-1.5 pl-1">
                        {group.steps.map((altStep, altIdx) => {
                          const cleanText = altStep.text.replace(/^(?:Option|Method|Way)\s*\d+[:.-]?\s*/i, "");
                          const altHasSource = altStep.evidence && (altStep.evidence.page || altStep.evidence.quote);

                          return (
                            <div
                              key={altStep.id || altIdx}
                              className={`p-2.5 rounded-xl border text-xs sm:text-sm flex items-start justify-between gap-2 ${
                                isDone ? "bg-slate-100/60 border-slate-200 text-slate-400" : "bg-purple-50/50 border-purple-100 text-slate-800"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="font-bold text-purple-700 mt-0.5 shrink-0">•</span>
                                <span className={isDone ? "line-through" : "font-medium"}>{cleanText}</span>
                              </div>
                              {altHasSource && onShowSource && (
                                <button
                                  type="button"
                                  onClick={() => onShowSource(altStep.evidence?.page, altStep.evidence?.quote)}
                                  className="text-[11px] font-bold text-purple-700 hover:underline shrink-0"
                                >
                                  p.{altStep.evidence.page || 1}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Submission channel sub-line under the first relevant action step */}
                  {gIdx === 0 && whereText && (
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

      {/* Conditional steps rendered as lightly styled informational notes (NOT to-dos) */}
      {conditionalSteps.length > 0 && (
        <div className="pt-2 space-y-2.5">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
            Conditional Steps / Notes
          </h3>
          <div className="space-y-2">
            {conditionalSteps.map((cStep, cIdx) => (
              <div
                key={cIdx}
                className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs sm:text-sm text-amber-950 flex items-start justify-between gap-2.5 shadow-xs"
              >
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    {cStep.condition && (
                      <p className="font-extrabold text-amber-900 text-xs uppercase tracking-wide">
                        {cStep.condition}
                      </p>
                    )}
                    <p className="font-medium text-amber-950 mt-0.5 leading-relaxed">{cStep.text}</p>
                  </div>
                </div>
                {cStep.evidence && (cStep.evidence.page || cStep.evidence.quote) && onShowSource && (
                  <button
                    type="button"
                    onClick={() => onShowSource(cStep.evidence.page, cStep.evidence.quote)}
                    className="text-xs font-bold text-amber-900 hover:underline shrink-0"
                  >
                    p.{cStep.evidence.page || 1}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

