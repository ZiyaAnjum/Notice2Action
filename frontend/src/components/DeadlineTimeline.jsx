import { useMemo } from "react";
import {
  Calendar,
  Clock,
  AlertTriangle,
  FileText,
  CheckCircle,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import { ConsequenceList } from "./ConsequenceList";
import { formatDate } from "../utils/text";

export function DeadlineTimeline({
  deadlines = [],
  consequences = [],
  onShowSource = null,
}) {
  const sortedDeadlines = useMemo(() => {
    return [...(deadlines || [])].sort((a, b) => {
      const dateA = a.date || "";
      const dateB = b.date || "";
      return dateA.localeCompare(dateB);
    });
  }, [deadlines]);

  if (sortedDeadlines.length === 0) {
    return null;
  }

  // Today ISO date string YYYY-MM-DD in local time
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Find index of the next impending deadline (first one today or later)
  const nextDeadlineIndex = sortedDeadlines.findIndex(
    (d) => d.date && d.date >= todayStr
  );

  return (
    <section
      aria-labelledby="timeline-heading"
      className="bg-white border-2 border-slate-300 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 id="timeline-heading" className="text-xl sm:text-2xl font-black text-navy-950">
            Timeline of Deadlines
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-0.5">
            Key milestone dates ordered chronologically. Action before earlier milestones avoids penalties.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
            <span>Today: {formatDate(todayStr)}</span>
          </span>
        </div>
      </div>

      {/* Responsive Timeline container: vertical on mobile, horizontal on tablet/desktop */}
      <div className="relative">
        <div
          role="list"
          aria-label="Ordered deadlines timeline"
          className="flex flex-col sm:flex-row items-stretch sm:items-start gap-4 sm:gap-3 overflow-x-auto pb-2"
        >
          {sortedDeadlines.map((item, idx) => {
            const isPast = item.date && item.date < todayStr;
            const isNext = idx === nextDeadlineIndex;
            const isEstimated = item.date_type === "estimated";
            const hasUncertainty = item.evidence && item.evidence.verified === false;
            const hasSource = item.evidence && (item.evidence.page || item.evidence.quote);

            // Format derivation tooltip
            let derivationTooltip = "Calculated from terms mentioned in notice";
            if (item.derived_from) {
              const rel = (item.derived_from.relative_to || "due date").replace(/_/g, " ");
              derivationTooltip = `Calculated as ${item.derived_from.offset_days} days after ${rel}`;
            }

            return (
              <div
                key={item.id || idx}
                role="listitem"
                className={`flex-1 min-w-[240px] p-4 rounded-2xl border transition-all relative ${
                  isNext
                    ? "bg-purple-50/70 border-2 border-purple-500 shadow-sm"
                    : isPast
                    ? "bg-slate-50 border-slate-200 opacity-60 text-slate-400"
                    : "bg-white border-slate-200 shadow-xs"
                }`}
              >
                {/* Top Badge: Next Up or Past */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isNext && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide bg-purple-600 text-white">
                        Next Deadline
                      </span>
                    )}
                    {isPast && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600">
                        Past
                      </span>
                    )}

                    {isEstimated && (
                      <span
                        title={derivationTooltip}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 cursor-help"
                      >
                        <HelpCircle className="w-3 h-3 text-amber-800" aria-hidden="true" />
                        <span>Estimated</span>
                      </span>
                    )}
                  </div>

                  {hasUncertainty && (
                    <span
                      title="Quote could not be verified verbatim in original notice text"
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-800" aria-hidden="true" />
                      <span>Verify</span>
                    </span>
                  )}
                </div>

                {/* Deadline Label & Date */}
                <div className="space-y-1">
                  <p
                    className={`font-black text-sm sm:text-base leading-snug ${
                      isNext ? "text-purple-950" : isPast ? "text-slate-500" : "text-navy-950"
                    }`}
                  >
                    {item.label}
                  </p>

                  <p
                    className={`text-lg sm:text-xl font-black ${
                      isNext ? "text-purple-700" : isPast ? "text-slate-400" : "text-navy-900"
                    }`}
                  >
                    {item.date ? formatDate(item.date) : "Date unspecified"}
                  </p>

                  {isEstimated && (
                    <p className="text-[11px] font-medium text-amber-900 leading-tight">
                      {derivationTooltip}
                    </p>
                  )}
                </div>

                {/* Footer with Source citation */}
                {hasSource && onShowSource && (
                  <div className="pt-2 mt-2 border-t border-slate-100/80 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onShowSource(item.evidence.page, item.evidence.quote)}
                      aria-label={`View source citation for ${item.label}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline min-h-[32px] px-1 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
                    >
                      <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Source {item.evidence.page ? `p.${item.evidence.page}` : ""}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Compact Consequences rows embedded directly under timeline */}
      <ConsequenceList consequences={consequences} onShowSource={onShowSource} />
    </section>
  );
}

