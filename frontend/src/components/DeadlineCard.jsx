import { EvidenceBadge } from "./EvidenceBadge";

export function DeadlineCard({ deadlines = [] }) {
  if (!deadlines || deadlines.length === 0) {
    return (
      <div className="bg-white border-2 border-slate-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Critical Deadlines
        </h3>
        <p className="mt-2 text-slate-600 text-sm">
          No deadlines found in this notice.
        </p>
      </div>
    );
  }

  // Primary deadline is the first found deadline
  const primaryDeadline = deadlines[0];
  const secondaryDeadlines = deadlines.slice(1);

  return (
    <div className="bg-white border-2 border-emerald-600 rounded-2xl p-6 sm:p-8 shadow-md">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800">
          ● Primary Critical Deadline
        </span>
        <EvidenceBadge evidence={primaryDeadline.evidence} status={primaryDeadline.status} />
      </div>

      <div className="mt-4">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
          {primaryDeadline.label}
        </h2>
        <div className="mt-2 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <div className="text-3xl sm:text-4xl font-extrabold text-emerald-700 tracking-tight">
              {primaryDeadline.iso_date
                ? new Date(primaryDeadline.iso_date).toLocaleDateString(undefined, {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : primaryDeadline.original_text}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-600">
              Notice text: <span className="font-semibold italic">&ldquo;{primaryDeadline.original_text}&rdquo;</span>
            </div>
          </div>
          {primaryDeadline.status !== "found" && (
            <div className="text-xs px-3 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 font-semibold self-start sm:self-auto">
              Status: {primaryDeadline.status} (Please verify with official office)
            </div>
          )}
        </div>
      </div>

      {secondaryDeadlines.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-200">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Additional Notice Milestones & Windows
          </h4>
          <div className="space-y-3">
            {secondaryDeadlines.map((dl, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 gap-2"
              >
                <div>
                  <span className="font-medium text-slate-800">{dl.label}</span>
                  <div className="text-sm font-semibold text-slate-700">
                    {dl.original_text}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {dl.status !== "found" && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                      {dl.status}
                    </span>
                  )}
                  <EvidenceBadge evidence={dl.evidence} status={dl.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
