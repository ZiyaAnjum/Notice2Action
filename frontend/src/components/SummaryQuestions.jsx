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
      className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5"
      aria-labelledby="plain-summary-heading"
    >
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
        <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
          <HelpCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 block">
            Plain Language Explanation
          </span>
          <h2 id="plain-summary-heading" className="text-xl font-extrabold text-slate-950 tracking-tight">
            5 Simple Questions About Your Notice
          </h2>
        </div>
      </div>

      <div className="space-y-4">
        {SUMMARY_QUESTIONS.map(({ key, question, ariaId }) => {
          const rawValue = summary ? summary[key] : null;
          const isMissing =
            !rawValue ||
            rawValue.trim() === "" ||
            rawValue.toLowerCase() === "not_found" ||
            rawValue.toLowerCase() === "not stated in the notice";
          const displayContent = isMissing ? "Not stated in the notice" : rawValue;

          return (
            <article
              key={key}
              className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
              aria-labelledby={ariaId}
            >
              <h3 id={ariaId} className="text-base font-extrabold text-slate-900">
                {question}
              </h3>
              <p
                className={`text-sm sm:text-base leading-relaxed ${
                  isMissing ? "text-slate-500 italic" : "text-slate-800 font-medium"
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
