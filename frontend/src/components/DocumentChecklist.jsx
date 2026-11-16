import { CheckSquare, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { UncertainBadge } from "./UncertainBadge";

const STATUS_CONFIG = {
  not_completed: {
    label: "Not completed",
    icon: Clock,
    badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    badgeClass: "bg-sage-100 text-sage-900 border-sage-300 font-bold",
  },
  needs_verification: {
    label: "Needs verification",
    icon: AlertCircle,
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300 font-bold",
  },
};

export function DocumentChecklist({
  documents = [],
  checklistMap = {},
  onStatusChange,
  onShowSource,
  errorMessage,
}) {
  return (
    <section
      className="bg-white border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-card space-y-6"
      aria-labelledby="checklist-heading"
    >
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-2.5">
              <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
                <CheckSquare className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-700 block">
                    Paperwork &amp; Records
                  </span>
                    <h2 id="checklist-heading" className="text-xl font-black text-stone-950 tracking-tight">
                      Required Documents Checklist
                    </h2>
                  </div>
              </div>
                <span className="text-xs font-extrabold bg-stone-100 text-stone-800 px-3 py-1 rounded-full border border-stone-200">
                  {documents.length} {documents.length === 1 ? "Document" : "Documents"}
                </span>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 bg-coral-50 border border-coral-300 rounded-xl text-coral-900 text-xs sm:text-sm flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-coral-600 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {documents.length === 0 ? (
                <p className="text-stone-500 text-xs sm:text-sm font-medium">
                  No specific documents were required by this notice.
                </p>
                ) : (
                  <ul className="space-y-3.5 list-none m-0 p-0">
                    {documents.map((doc, idx) => {
                      const itemKey = doc.key || doc.name || `doc-${idx}`;
                      const currentStatus = checklistMap[itemKey] || "not_completed";
                      const isRequired = doc.is_required !== false && doc.explicitly_required !== false;
                      const isUncertain = doc.status === "uncertain" || doc.needs_verification;
                      const page = doc.source_page || doc.evidence?.page;
                      const quote = doc.evidence_quote || doc.evidence?.quote;

                      return (
                        <li
                          key={idx}
                          className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-col gap-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                              <div className="space-y-1 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm sm:text-base font-extrabold text-stone-900">
                                      {doc.name || doc.document_name || "Document requirement"}
                                    </span>
                                    {!isRequired ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-stone-200/70 text-stone-700">
                                          {doc.label || "Suggested, not required"}
                                        </span>
                                        ) : (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
                                            Mandatory
                                          </span>
                      )}
                                          {isUncertain && (
                                            <div className="flex flex-wrap items-center gap-2">
                                              <UncertainBadge />
                                                <span className="text-[11px] text-amber-900 font-medium">
                                                  Please check original notice
                                                </span>
                                            </div>
                                          )}
                                        </div>

                                        {doc.description && (
                      <p className="text-xs text-stone-600 font-medium leading-relaxed">
                        {doc.description}
                      </p>
                                        )}
                                      </div>

                  {onShowSource && page && (
                                      <button
                                        type="button"
                                        onClick={() => onShowSource(page, quote)}
                                        className="text-xs font-bold text-teal-700 hover:text-teal-900 underline self-start sm:self-auto flex-shrink-0"
                                      >
                                        Source
                                      </button>
                                    )}
                                </div>

                                      {/* Status Toggle Row */ }
                                      <div className="flex items-center justify-between pt-2 border-t border-stone-200/60">
                                        <span className="text-xs text-stone-500 font-bold">Status:</span>
                                        <div className="flex items-center gap-1.5">
                                          {Object.entries(STATUS_CONFIG).map(([statusKey, cfg]) => {
                                            const Icon = cfg.icon;
                                            const isSelected = currentStatus === statusKey;

                                            return (
                                              <button
  key={statusKey}
  type="button"
  aria-pressed={isSelected ? "true" : "false"}
  onClick={() => onStatusChange && onStatusChange(itemKey, statusKey)}
  className={
    isSelected
      ? `${cfg.badgeClass} shadow-xs ring-1 ring-stone-400`
      : "bg-white text-stone-500 border border-stone-200 hover:bg-stone-50"
  }
>
                          <Icon className="w-3.5 h-3.5" />
                          <span>{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
