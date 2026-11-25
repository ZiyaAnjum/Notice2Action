import { Sparkles, FileText, CheckCircle2, Calendar, AlertTriangle } from "lucide-react";
import { useLanguage } from "../context/useLanguage";

const I18N = {
  en: {
    heading: "Simple Summary",
    subheading: "Plain-language overview at a Grade 6 reading level",
    whatIsThis: "What is this?",
    whatToDo: "What to do",
    byWhen: "By when",
    ifYouIgnore: "If you ignore",
  },
  hi: {
    heading: "सरल सारांश",
    subheading: "सरल भाषा में मुख्य विवरण (कक्षा 6 स्तर)",
    whatIsThis: "यह क्या है?",
    whatToDo: "आपको क्या करना है",
    byWhen: "समय सीमा",
    ifYouIgnore: "यदि अनदेखा किया तो",
  },
  kn: {
    heading: "ಸರಳ ಸಾರಾಂಶ",
    subheading: "ಸರಳ ಭಾಷೆಯಲ್ಲಿ ಮುಖ್ಯ ವಿವರಗಳು (6ನೇ ತರಗತಿ ಮಟ್ಟ)",
    whatIsThis: "ಇದು ಏನು?",
    whatToDo: "ನೀವು ಏನು ಮಾಡಬೇಕು",
    byWhen: "ಅಂತಿಮ ದಿನಾಂಕ",
    ifYouIgnore: "ಗಮನಿಸದಿದ್ದರೆ ಏನಾಗುತ್ತದೆ",
  },
};

export function SimpleSummaryCard({
  simpleSummary = null,
  fallbackData = {},
}) {
  const { language = "en" } = useLanguage ? useLanguage() : { language: "en" };
  const labels = I18N[language] || I18N.en;

  // Resolve values with graceful fallback
  const noticeType = fallbackData?.headline?.notice_type || fallbackData?.notice_type;
  const sourceOrg = fallbackData?.headline?.source_organisation || fallbackData?.source_organisation;

  const fallbackWhatIsThis = noticeType
    ? `This is an official ${noticeType} document${sourceOrg ? ` from ${sourceOrg}` : ""}.`
    : fallbackData?.category
    ? `This is an official ${fallbackData.category} notice requiring your review.`
    : "Official notice requiring your review and action.";

  const whatIsThis = simpleSummary?.what_is_this || fallbackWhatIsThis;

  let fallbackWhatToDo = "Review the notice instructions and complete the required tasks.";
  if (fallbackData?.headline?.amount_due) {
    const amt = fallbackData.headline.amount_due;
    fallbackWhatToDo = `Please remit ${amt.currency || "Rs."} ${amt.amount || ""}`.trim();
  } else if (fallbackData?.action_steps && fallbackData.action_steps.length > 0) {
    const firstStep = fallbackData.action_steps[0];
    fallbackWhatToDo = firstStep.group_title || firstStep.text || fallbackWhatToDo;
  }
  const whatToDo = simpleSummary?.what_to_do || fallbackWhatToDo;

  let fallbackByWhen = "Check timeline below for specific due dates.";
  if (fallbackData?.deadlines && fallbackData.deadlines.length > 0) {
    const d0 = fallbackData.deadlines[0];
    fallbackByWhen = d0.date
      ? `Due on or before ${d0.date}`
      : d0.date_rule_text || d0.label || fallbackByWhen;
  }
  const byWhen = simpleSummary?.by_when || fallbackByWhen;

  let fallbackIfIgnore = "Late fees, penalties, or service disruptions may apply.";
  if (fallbackData?.consequences && fallbackData.consequences.length > 0) {
    const c0 = fallbackData.consequences[0];
    fallbackIfIgnore = c0.value
      ? `Penalties or additional charges may apply (${c0.value}).`
      : "Late fees, penalties, or service disruptions may apply.";
  }
  const ifYouIgnore = simpleSummary?.if_you_ignore || fallbackIfIgnore;

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

        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide bg-purple-100 text-purple-900 border border-purple-200">
          Grade 6 Plain English
        </span>
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* 1. What is this */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
            <FileText className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
            <span>{labels.whatIsThis}</span>
          </div>
          <p className="text-sm sm:text-base font-bold text-navy-950 leading-snug pt-0.5">
            {whatIsThis}
          </p>
        </div>

        {/* 2. What to do */}
        <div className="p-4 rounded-2xl bg-white border border-purple-200 shadow-xs space-y-1">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-900">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-700" aria-hidden="true" />
            <span>{labels.whatToDo}</span>
          </div>
          <p className="text-sm sm:text-base font-extrabold text-purple-950 leading-snug pt-0.5">
            {whatToDo}
          </p>
        </div>

        {/* 3. By when */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
            <span>{labels.byWhen}</span>
          </div>
          <p className="text-sm sm:text-base font-bold text-navy-950 leading-snug pt-0.5">
            {byWhen}
          </p>
        </div>

        {/* 4. If you ignore */}
        <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-xs space-y-1">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-900">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
            <span>{labels.ifYouIgnore}</span>
          </div>
          <p className="text-sm sm:text-base font-bold text-rose-950 leading-snug pt-0.5">
            {ifYouIgnore}
          </p>
        </div>
      </div>
    </section>
  );
}
