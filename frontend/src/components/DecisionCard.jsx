import { useState } from "react";
import {
  Bell,
  CalendarPlus,
  Share2,
  FileText,
  ExternalLink,
  Check,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  Building,
} from "lucide-react";
import { generateIcsContent, triggerIcsDownload } from "../utils/calendar";

/**
 * Calculates countdown metrics from target ISO date string relative to local calendar day.
 */
function calculateCountdown(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;

  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) return null;

  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const diffTime = target.getTime() - todayMidnight.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      label: overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`,
      tone: "overdue",
      icon: AlertTriangle,
      badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
      iconClass: "text-rose-700",
    };
  }
  if (diffDays === 0) {
    return {
      label: "Due today",
      tone: "critical",
      icon: AlertTriangle,
      badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
      iconClass: "text-rose-700",
    };
  }
  if (diffDays === 1) {
    return {
      label: "Due tomorrow",
      tone: "urgent",
      icon: Clock,
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
      iconClass: "text-amber-800",
    };
  }
  if (diffDays <= 3) {
    return {
      label: `${diffDays} days left`,
      tone: "urgent",
      icon: Clock,
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
      iconClass: "text-amber-800",
    };
  }
  if (diffDays <= 7) {
    return {
      label: `${diffDays} days left`,
      tone: "soon",
      icon: Calendar,
      badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
      iconClass: "text-emerald-800",
    };
  }
  return {
    label: `${diffDays} days left`,
    tone: "neutral",
    icon: Calendar,
    badgeClass: "bg-slate-100 text-slate-800 border-slate-300",
    iconClass: "text-slate-600",
  };
}

/**
 * Format currency amount cleanly.
 */
function formatAmount(amountDue) {
  if (!amountDue || typeof amountDue !== "object") return null;
  const num = typeof amountDue.amount === "number" ? amountDue.amount : parseFloat(amountDue.amount);
  if (isNaN(num)) return null;

  const currency = amountDue.currency || "INR";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toLocaleString("en-IN")}`;
  }
}

export function DecisionCard({
  headline = {},
  primaryDeadline = null,
  pdfUrl = "#",
  noticeId = "",
  onRemind = null,
}) {
  const [copied, setCopied] = useState(false);

  const countdown = calculateCountdown(primaryDeadline?.date);
  const formattedAmount = formatAmount(headline.amount_due);
  const oneLineSummary =
    headline.one_line_summary || "Please review required actions for this official notice.";
  const noticeType = headline.notice_type || "Official Notice";
  const sourceOrg = headline.source_organisation || "";

  // Handle Share action with clipboard fallback
  const handleShare = async () => {
    const shareData = {
      title: oneLineSummary,
      text: `${oneLineSummary}${formattedAmount ? ` (${formattedAmount})` : ""}`,
      url: window.location.href,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name !== "AbortError") {
          // fallback to clipboard
        }
      }
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  // Handle Add to calendar .ics download directly
  const handleAddToCalendar = () => {
    if (!primaryDeadline?.date) return;
    const icsContent = generateIcsContent({
      title: oneLineSummary,
      description: `${oneLineSummary}\nAmount: ${formattedAmount || "N/A"}\nSource: ${sourceOrg}`,
      dateStr: primaryDeadline.date,
      noticeId,
    });
    if (icsContent) {
      const filename = `notice-deadline-${noticeId || "action"}.ics`;
      triggerIcsDownload(filename, icsContent);
    }
  };

  return (
    <section
      aria-label="Action Decision Card"
      className="bg-white border-2 border-slate-300 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6"
    >
      {/* Top Meta Chips: Type + Source */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200">
            {noticeType}
          </span>
          {sourceOrg && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
              <Building className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              <span>{sourceOrg}</span>
            </span>
          )}
        </div>

        {/* Secondary action: View original PDF */}
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View original PDF document in new tab"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition-colors focus:outline-hidden focus:ring-2 focus:ring-purple-600 min-h-[44px]"
          >
            <FileText className="w-4 h-4 text-slate-600" aria-hidden="true" />
            <span>View Original PDF</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          </a>
        )}
      </div>

      {/* Hero Headline */}
      <div className="space-y-3">
        <h1 className="text-2xl sm:text-4xl font-black text-navy-950 tracking-tight leading-tight">
          {oneLineSummary}
        </h1>

        {/* Prominent Amount Due & Countdown Badge Row */}
        {(formattedAmount || countdown) && (
          <div className="flex flex-wrap items-baseline gap-4 pt-2">
            {formattedAmount && (
              <div className="flex items-baseline gap-2">
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-500">
                  Amount due:
                </span>
                <span className="text-3xl sm:text-5xl font-black text-navy-950 tracking-tight">
                  {formattedAmount}
                </span>
              </div>
            )}

            {countdown && (
              <div
                role="status"
                aria-label={`Deadline status: ${countdown.label}`}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-extrabold border ${countdown.badgeClass}`}
              >
                <countdown.icon className={`w-4 h-4 ${countdown.iconClass}`} aria-hidden="true" />
                <span>{countdown.label}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Primary Action Buttons Bar */}
      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
        {onRemind && (
          <button
            type="button"
            onClick={onRemind}
            aria-label="Remind me about this deadline"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all focus:outline-hidden focus:ring-2 focus:ring-purple-600 min-h-[44px]"
          >
            <Bell className="w-4 h-4" aria-hidden="true" />
            <span>Remind Me</span>
          </button>
        )}

        {primaryDeadline?.date && (
          <button
            type="button"
            onClick={handleAddToCalendar}
            aria-label="Add to Calendar (.ics download)"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 hover:text-navy-950 transition-all focus:outline-hidden focus:ring-2 focus:ring-purple-600 min-h-[44px]"
          >
            <CalendarPlus className="w-4 h-4 text-purple-700" aria-hidden="true" />
            <span>Add to Calendar</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleShare}
          aria-label={copied ? "Link copied to clipboard" : "Share this notice"}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 hover:text-navy-950 transition-all focus:outline-hidden focus:ring-2 focus:ring-purple-600 min-h-[44px]"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span className="text-emerald-700 font-bold">Link Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>Share</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
