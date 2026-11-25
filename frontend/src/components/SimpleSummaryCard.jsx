import { useState, useEffect } from "react";
import { Sparkles, FileText, CheckCircle2, Calendar, AlertTriangle } from "lucide-react";
import { useLanguage } from "../context/useLanguage";
import { getNoticeSummary } from "../api/client";

const I18N = {
  en: {
    heading: "Simple Summary",
    subheading: "Quick overview of this notice",
    whatIsThis: "What is this?",
    whatToDo: "What to do",
    byWhen: "By when",
    ifYouIgnore: "If you ignore",
  },
  hi: {
    heading: "सरल सारांश",
    subheading: "इस नोटिस का संक्षिप्त विवरण",
    whatIsThis: "यह क्या है?",
    whatToDo: "आपको क्या करना है",
    byWhen: "समय सीमा",
    ifYouIgnore: "यदि अनदेखा किया तो",
  },
  kn: {
    heading: "ಸರಳ ಸಾರಾಂಶ",
    subheading: "ಈ ನೋಟಿಸ್‌ನ ತ್ವರಿತ ಅವಲೋಕನ",
    whatIsThis: "ಇದು ಏನು?",
    whatToDo: "ನೀವು ಏನು ಮಾಡಬೇಕು",
    byWhen: "ಅಂತಿಮ ದಿನಾಂಕ",
    ifYouIgnore: "ಗಮನಿಸದಿದ್ದರೆ ಏನಾಗುತ್ತದೆ",
  },
};

export function SimpleSummaryCard({
  noticeId = null,
  simpleSummary = null,
  fallbackData = {},
  lastUpdated = null,
}) {
  const { language = "en" } = useLanguage ? useLanguage() : { language: "en" };
  const labels = I18N[language] || I18N.en;

  const [asyncSummary, setAsyncSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!noticeId) {
      setAsyncSummary(null);
      return;
    }

    setLoading(true);
    getNoticeSummary(noticeId, language)
      .then((data) => {
        if (active && data) {
          setAsyncSummary(data);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch multilingual simple summary:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [noticeId, language, lastUpdated]);

  const activeSummary = asyncSummary || simpleSummary;

  // Resolve values with graceful fallback
  const noticeType = fallbackData?.headline?.notice_type || fallbackData?.notice_type;
  const sourceOrg = fallbackData?.headline?.source_organisation || fallbackData?.source_organisation;

  const fallbackWhatIsThis = noticeType
    ? `This is an official ${noticeType} document${sourceOrg ? ` from ${sourceOrg}` : ""}.`
    : fallbackData?.category
    ? `This is an official ${fallbackData.category} notice requiring your review.`
    : "Official notice requiring your review and action.";

  const whatIsThis = activeSummary?.what_is_this || (language === "en" ? fallbackWhatIsThis : "");

  let fallbackWhatToDo = "";
  if (fallbackData?.headline?.amount_due) {
    const amt = fallbackData.headline.amount_due;
    fallbackWhatToDo = `Please remit ${amt.currency || "₹"} ${amt.amount || ""}`.trim();
  } else if (fallbackData?.action_steps && fallbackData.action_steps.length > 0) {
    const firstStep = fallbackData.action_steps[0];
    fallbackWhatToDo = firstStep.group_title || firstStep.text || "";
  }
  const whatToDo = activeSummary?.what_to_do || (language === "en" ? fallbackWhatToDo : "");

  let fallbackByWhen = "";
  if (fallbackData?.deadlines && fallbackData.deadlines.length > 0) {
    const d0 = fallbackData.deadlines[0];
    fallbackByWhen = d0.date
      ? `Due on or before ${d0.date}`
      : d0.date_rule_text || d0.label || "";
  }
  const byWhen = activeSummary?.by_when || (language === "en" ? fallbackByWhen : "");

  let fallbackIfIgnore = "";
  if (fallbackData?.consequences && fallbackData.consequences.length > 0) {
    const c0 = fallbackData.consequences[0];
    fallbackIfIgnore = c0.value || c0.label || "";
  }
  const ifYouIgnore = activeSummary?.if_you_ignore || (language === "en" ? fallbackIfIgnore : "");

  return (
    <section
      aria-labelledby="simple-summary-heading"
      className="bg-gradient-to-br from-purple-50/90 via-indigo-50/50 to-white border-2 border-purple-200 rounded-3xl p-6 sm:p-7 shadow-xs space-y-5 ui-fade-in"
    >
      <div className="flex items-center justify-between gap-3 border-b border-purple-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="p-2 bg-purple-600 text-white rounded-xl shadow-xs">
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="simple-summary-heading" className="text-lg sm:text-xl font-black text-navy-950">
              {labels.heading}
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              {labels.subheading}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 animate-pulse" aria-label="Loading summary">
          <div className="p-4 rounded-2xl bg-white/70 border border-slate-200 space-y-2">
            <div className="h-3 w-24 bg-purple-200 rounded"></div>
            <div className="h-4 w-full bg-slate-200 rounded"></div>
            <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
          </div>
          <div className="p-4 rounded-2xl bg-white/70 border border-purple-200 space-y-2">
            <div className="h-3 w-24 bg-purple-200 rounded"></div>
            <div className="h-4 w-full bg-slate-200 rounded"></div>
            <div className="h-4 w-2/3 bg-slate-200 rounded"></div>
          </div>
          <div className="p-4 rounded-2xl bg-white/70 border border-slate-200 space-y-2">
            <div className="h-3 w-24 bg-indigo-200 rounded"></div>
            <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
          </div>
          <div className="p-4 rounded-2xl bg-white/70 border border-rose-200 space-y-2">
            <div className="h-3 w-24 bg-rose-200 rounded"></div>
            <div className="h-4 w-4/5 bg-slate-200 rounded"></div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* 1. What is this */}
          {Boolean(whatIsThis) && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <FileText className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
                <span>{labels.whatIsThis}</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-navy-950 leading-snug pt-0.5">
                {whatIsThis}
              </p>
            </div>
          )}

          {/* 2. What to do */}
          {Boolean(whatToDo) && (
            <div className="p-4 rounded-2xl bg-white border border-purple-200 shadow-xs space-y-1">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-900">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-700" aria-hidden="true" />
                <span>{labels.whatToDo}</span>
              </div>
              <p className="text-sm sm:text-base font-extrabold text-purple-950 leading-snug pt-0.5">
                {whatToDo}
              </p>
            </div>
          )}

          {/* 3. By when */}
          {Boolean(byWhen) && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                <span>{labels.byWhen}</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-navy-950 leading-snug pt-0.5">
                {byWhen}
              </p>
            </div>
          )}

          {/* 4. If you ignore */}
          {Boolean(ifYouIgnore) && (
            <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-xs space-y-1">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-900">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
                <span>{labels.ifYouIgnore}</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-rose-950 leading-snug pt-0.5">
                {ifYouIgnore}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
