import { Globe } from "lucide-react";
import { useLanguage } from "../context/useLanguage";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "EN", fullLabel: "English" },
  { code: "hi", label: "HI", fullLabel: "हिंदी" },
  { code: "kn", label: "KN", fullLabel: "ಕನ್ನಡ" },
];

export function LanguageToggle({ className = "" }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Select language"
      className={`inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 ${className}`}
    >
      <Globe className="w-3.5 h-3.5 text-slate-500 ml-1.5 shrink-0" aria-hidden="true" />
      <div className="flex items-center gap-0.5">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = language === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              aria-pressed={isActive}
              title={`Switch language to ${lang.fullLabel}`}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all min-h-[32px] sm:min-h-[28px] focus:outline-hidden focus:ring-2 focus:ring-purple-600 ${
                isActive
                  ? "bg-white text-purple-900 shadow-xs border border-purple-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <span className="hidden sm:inline">{lang.fullLabel}</span>
              <span className="sm:hidden">{lang.code.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}