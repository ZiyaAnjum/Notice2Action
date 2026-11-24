import { HelpCircle } from "lucide-react";

const SUMMARY_QUESTIONS = [
  {
    key: "what_is_this",
    question: "What is this notice about?",
    ariaId: "summary-what-is-this",
  },
  {
    key: "why_it_matters",
    question: "Why might it matter to me?",
    ariaId: "summary-why-it-matters",
  },
  {
    key: "what_to_do",
    question: "What do I need to do?",
    ariaId: "summary-what-to-do",
  },
  {
    key: "where_to_do_it",
    question: "Where should I do it?",
    ariaId: "summary-where-to-do-it",
  },
  {
    key: "if_deadline_missed",
    question: "What happens if I miss the deadline?",
    ariaId: "summary-deadline-missed",
  },
];

export function SummaryQuestions({ summary = {} }) {
  return (
    <section
      className="surface-card p-6 sm:p-8 space-y-5"
      aria-labelledby="plain-summary-heading"
    >
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
          <HelpCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
            Plain Language Explanation
          </span>
          <h2 id="plain-summary-heading" className="text-lg sm:text-xl font-extrabold text-navy-950 tracking-tight">
            5 Simple Questions About Your Notice
          </h2>
        </div>
      </div>

      <div className="space-y-3">
        {SUMMARY_QUESTIONS.map(({ key, question, ariaId }) => {
          const rawValue = summary ? summary[key] : null;
          let textValue = rawValue;
          if (typeof rawValue === "object" && rawValue !== null) {
            textValue = rawValue.text ?? "";
          }
          const textStr = typeof textValue === "string" ? textValue : String(textValue || "");
          const isMissing =
            !textStr ||
            textStr.trim() === "" ||
            textStr.toLowerCase() === "not_found" ||
            textStr.toLowerCase() === "not stated in the notice";
          const displayContent = isMissing ? "Not stated in the notice" : textStr;

          return (
            <article
              key={key}
              className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 border border-slate-200/90 space-y-1 transition hover:bg-white hover:border-purple-200"
              aria-labelledby={ariaId}
            >
              <h3 id={ariaId} className="text-xs sm:text-sm font-black text-navy-950">
                {question}
              </h3>
              <p
                className={`text-xs sm:text-sm leading-relaxed ${
                  isMissing ? "text-slate-400 italic font-medium" : "text-slate-700 font-medium"
                }`}
              >
                {displayContent}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
