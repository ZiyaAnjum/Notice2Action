import { CheckSquare, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { UncertainBadge } from "./UncertainBadge";

const STATUS_CONFIG = {
  not_completed: {
    label: "Not completed",
    icon: Clock,
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold",
  },
  needs_verification: {
    label: "Needs verification",
    icon: AlertCircle,
    badgeClass: "bg-amber-50 text-amber-900 border-amber-300 font-bold",
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
      className="surface-card p-6 sm:p-8 space-y-5"
      aria-labelledby="checklist-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
            <CheckSquare className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
              Paperwork &amp; Records
            </span>
            <h2 id="checklist-heading" className="text-lg sm:text-xl font-extrabold text-navy-950 tracking-tight">
              Required Documents Checklist
            </h2>
          </div>
        </div>
        <span className="text-xs font-bold bg-purple-50 text-purple-800 px-3 py-1 rounded-full border border-purple-200">
          {documents.length} {documents.length === 1 ? "Document" : "Documents"}
        </span>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 text-xs sm:text-sm flex items-start gap-2.5 ui-fade-in"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-slate-500 text-xs sm:text-sm font-medium">
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
                className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200 flex flex-col gap-3 transition hover:bg-white hover:border-purple-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs sm:text-sm font-extrabold text-navy-950">
                        {doc.name || doc.document_name || "Document requirement"}
                      </span>
                      {!isRequired ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 text-slate-700">
                          {doc.label || "Suggested, not required"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-800 border border-purple-200">
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
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        {doc.description}
                      </p>
                    )}
                  </div>

                  {onShowSource && page && (
                    <button
                      type="button"
                      onClick={() => onShowSource(page, quote)}
                      className="focus-ring text-xs font-bold text-purple-700 hover:text-purple-900 underline self-start sm:self-auto shrink-0"
                    >
                      Source
                    </button>
                  )}
                </div>

                {/* Status Toggle Row */}
                <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/70">
                  <span className="text-[11px] text-slate-500 font-bold">Status:</span>
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
                          className={`focus-ring inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold border transition ${
                            isSelected
                              ? `${cfg.badgeClass} shadow-xs ring-1 ring-purple-300`
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          }`}
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
