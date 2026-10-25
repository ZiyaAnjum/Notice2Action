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
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-400 font-bold",
  },
  needs_verification: {
    label: "Needs verification",
    icon: AlertCircle,
    badgeClass: "bg-amber-100 text-amber-900 border-amber-400 font-bold",
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
      className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6"
      aria-labelledby="checklist-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
            <CheckSquare className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 block">
              Paperwork & Records
            </span>
            <h2 id="checklist-heading" className="text-xl font-extrabold text-slate-950 tracking-tight">
              Required Documents Checklist
            </h2>
          </div>
        </div>
        <span className="text-xs font-bold bg-slate-100 text-slate-800 px-3 py-1 rounded-full">
          {documents.length} {documents.length === 1 ? "Document" : "Documents"}
        </span>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs sm:text-sm flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-slate-600 text-sm font-medium">
          No specific documents were required by this notice.
        </p>
      ) : (
        <ul className="space-y-4 list-none m-0 p-0">
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
                className="p-4 sm:p-5 rounded-xl bg-slate-50 border-2 border-slate-200 flex flex-col gap-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-extrabold text-slate-900">
                        {doc.name || doc.document_name || "Document requirement"}
                      </span>
                      {!isRequired ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-200 text-slate-700">
                          Suggested, not required by the notice
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-100 text-indigo-900">
                          Mandatory
                        </span>
                      )}
                      {isUncertain && <UncertainBadge />}
                    </div>

                    {doc.description && (
                      <p className="text-sm text-slate-700 font-medium">{doc.description}</p>
                    )}
                  </div>

                  {onShowSource && page && (
                    <button
                      type="button"
                      onClick={() => onShowSource(page, quote)}
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[36px] self-start sm:self-auto"
                    >
                      Show Source
                    </button>
                  )}
                </div>

                {/* Status selector control */}
                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Your Status:
                  </span>
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label={`Status for ${doc.name}`}
                  >
                    {["not_completed", "completed", "needs_verification"].map((statusKey) => {
                      const isSelected = currentStatus === statusKey;
                      const config = STATUS_CONFIG[statusKey];
                      const Icon = config.icon;

                      return (
                        <button
                          key={statusKey}
                          type="button"
                          onClick={() => onStatusChange && onStatusChange(itemKey, statusKey)}
                          aria-pressed={isSelected}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] focus:outline-hidden focus:ring-2 focus:ring-indigo-600 border ${
                            isSelected
                              ? `${config.badgeClass} ring-2 ring-indigo-500 shadow-xs`
                              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{config.label}</span>
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
