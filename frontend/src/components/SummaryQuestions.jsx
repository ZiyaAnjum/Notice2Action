import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useLanguage } from "../context/useLanguage";
import { SUPPORTED_LANGUAGES } from "../utils/languages";
import { ShareSummaryActions } from "./ShareSummaryActions";

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
  const { language } = useLanguage();
  const [speechState, setSpeechState] = useState("idle");
  const [availableVoices, setAvailableVoices] = useState([]);
  const utteranceRef = useRef(null);

  const normalizedSections = useMemo(() =>
    SUMMARY_QUESTIONS.map(({ key, question, ariaId }) => {
      const rawValue = summary?.[key];
      const textValue =
        typeof rawValue === "object" && rawValue !== null
          ? rawValue.text ?? ""
          : rawValue;
      const textStr = typeof textValue === "string" ? textValue : String(textValue || "");
      const isMissing =
        !textStr.trim() ||
        textStr.trim().toLowerCase() === "not_found" ||
        textStr.trim().toLowerCase() === "not stated in the notice";

      return {
        key,
        question,
        ariaId,
        isMissing,
        displayContent: isMissing ? "Not stated in the notice" : textStr.trim(),
      };
    }), [summary]);

  const hasReadableSummary = normalizedSections.some(({ isMissing }) => !isMissing);
  const noticeText = useMemo(
    () => normalizedSections
      .filter(({ isMissing }) => !isMissing)
      .map(({ displayContent }) => displayContent)
      .join(" "),
    [normalizedSections]
  );

  const speechText = useMemo(
    () => normalizedSections
      .filter(({ isMissing }) => !isMissing)
      .map(({ question, displayContent }) => `${question} ${displayContent}`)
      .join(" "),
    [normalizedSections]
  );

  const speechSupported =
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof (window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance) === "function";

  const stopSpeech = useCallback(() => {
    utteranceRef.current = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeechState("idle");
  }, []);

  useEffect(() => {
    if (!speechSupported) return undefined;

    const synth = window.speechSynthesis;
    const updateVoices = () => setAvailableVoices(synth.getVoices?.() || []);
    updateVoices();
    synth.addEventListener?.("voiceschanged", updateVoices);

    return () => {
      synth.removeEventListener?.("voiceschanged", updateVoices);
    };
  }, [speechSupported]);

  useEffect(() => {
    stopSpeech();
  }, [speechText, stopSpeech]);

  useEffect(() => {
    stopSpeech();
  }, [language, stopSpeech]);

  useEffect(() => () => {
    utteranceRef.current = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const scriptForText = (text) => {
    const scripts = [
      ["kn", /[\u0C80-\u0CFF]/g],
      ["hi", /[\u0900-\u097F]/g],
      ["ur", /[\u0600-\u06FF]/g],
      ["ta", /[\u0B80-\u0BFF]/g],
      ["te", /[\u0C00-\u0C7F]/g],
      ["ml", /[\u0D00-\u0D7F]/g],
    ];
    const counts = scripts.map(([code, pattern]) => [code, text.match(pattern)?.length || 0]);
    const [highestCode, highestCount] = counts.sort((a, b) => b[1] - a[1])[0];
    if (highestCount > 0) return highestCode;
    return [...text].some((character) => character.charCodeAt(0) > 127) ? null : "en";
  };

  const LANGUAGE_NAMES = {
    en: "English",
    kn: "Kannada",
    hi: "Hindi",
    ur: "Urdu",
    ta: "Tamil",
    te: "Telugu",
    ml: "Malayalam",
  };

  const selectSpeechVoice = (text) => {
    const textScript = scriptForText(text);
    const textLanguage = SUPPORTED_LANGUAGES.find(({ code }) => code === textScript);

    if (!textLanguage) {
      return {
        languageCode: null,
        languageName: null,
        locale: null,
        voice: null,
      };
    }

    const locale = textScript === "en" ? "en-US" : textLanguage.locale;
    const voice = availableVoices.find(({ lang }) => {
      const normalized = (lang || "").replace("_", "-").toLowerCase();
      const languagePrefix = textScript === "en" ? "en" : textLanguage.locale.split("-")[0];
      return normalized === locale.toLowerCase() ||
        normalized === `${languagePrefix}-in` ||
        normalized.startsWith(`${languagePrefix}-`);
    });

    return {
      languageCode: textScript,
      languageName: LANGUAGE_NAMES[textScript],
      locale,
      voice: voice || null,
    };
  };

  const startSpeech = () => {
    if (!speechSupported || !hasReadableSummary || !speechText) return;

    stopSpeech();
    const Utterance = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance;
    const utterance = new Utterance(speechText);
    const { locale, voice } = selectSpeechVoice(noticeText);

    if (locale) utterance.lang = locale;
    if (voice) utterance.voice = voice;

    utteranceRef.current = utterance;
    utterance.onstart = () => {
      if (utteranceRef.current === utterance) setSpeechState("playing");
    };
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setSpeechState("idle");
      }
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      if (event?.error === "canceled" || event?.error === "interrupted") return;
      utteranceRef.current = null;
      setSpeechState("idle");
    };

    setSpeechState("playing");
    window.speechSynthesis.speak(utterance);
  };

  const pauseSpeech = () => {
    if (speechSupported && speechState === "playing") {
      window.speechSynthesis.pause();
      setSpeechState("paused");
    }
  };

  const resumeSpeech = () => {
    if (speechSupported && speechState === "paused") {
      window.speechSynthesis.resume();
      setSpeechState("playing");
    }
  };

  const noticeTextIsEnglish = scriptForText(noticeText) === "en";
  const interfaceLanguage = SUPPORTED_LANGUAGES.find(({ code }) => code === language);
  const interfaceLanguageName = {
    en: "English",
    kn: "Kannada",
    hi: "Hindi",
    ur: "Urdu",
    ta: "Tamil",
    te: "Telugu",
    ml: "Malayalam",
  }[language] || interfaceLanguage?.name;
  const showLanguageLimitation = noticeTextIsEnglish && language !== "en";
  const voiceSelection = selectSpeechVoice(noticeText);
  const showVoiceFallbackMessage =
    speechSupported && hasReadableSummary && !voiceSelection.voice;

  return (
    <section
      className="bg-white border border-stone-200/90 rounded-3xl p-6 sm:p-8 shadow-card space-y-5"
      aria-labelledby="plain-summary-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-stone-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <HelpCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 block">
              Plain Language Explanation
            </span>
            <h2 id="plain-summary-heading" className="text-xl font-black text-stone-950 tracking-tight">
              5 Simple Questions About Your Notice
            </h2>
          </div>
        </div>

        {speechSupported && hasReadableSummary && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Notice explanation speech controls">
            {speechState === "idle" && (
              <button
                type="button"
                onClick={startSpeech}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3.5 text-xs font-bold text-teal-800 hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                aria-label="Listen to notice explanation"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>Listen</span>
              </button>
            )}
            {speechState === "playing" && (
              <button
                type="button"
                onClick={pauseSpeech}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-bold text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
                aria-label="Pause notice explanation"
              >
                <Pause className="h-4 w-4" aria-hidden="true" />
                <span>Pause</span>
              </button>
            )}
            {speechState === "paused" && (
              <button
                type="button"
                onClick={resumeSpeech}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3.5 text-xs font-bold text-teal-800 hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                aria-label="Resume notice explanation"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Resume</span>
              </button>
            )}
            {(speechState === "playing" || speechState === "paused") && (
              <button
                type="button"
                onClick={stopSpeech}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-bold text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
                aria-label="Stop notice explanation"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
                <span>Stop</span>
              </button>
            )}
          </div>
        )}
      </div>

      {!speechSupported && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-medium text-amber-900">
          Listen to Notice Explanation is not supported by this browser. Voice availability varies by browser and operating system.
        </p>
      )}

      {speechSupported && !hasReadableSummary && (
        <p role="status" className="rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-xs font-medium text-stone-600">
          No plain-language explanation is available to listen to.
        </p>
      )}

      {showLanguageLimitation && (
        <p className="text-[11px] leading-5 text-slate-500">
          This notice text is English. The interface is set to {interfaceLanguageName}; this notice content has not been translated.
        </p>
      )}

      {showVoiceFallbackMessage && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-medium text-amber-900">
          {voiceSelection.languageName
            ? `No matching ${voiceSelection.languageName} voice is available. The browser's default voice will be used, so pronunciation may be inaccurate.`
            : "The notice language could not be identified. The browser's default voice will be used, so pronunciation may be inaccurate."}
        </p>
      )}

      <ShareSummaryActions
        sections={normalizedSections}
        hasReadableSummary={hasReadableSummary}
      />

      <div className="space-y-3.5">
        {normalizedSections.map(({ key, question, ariaId, isMissing, displayContent }) => (
          <article
            key={key}
            className="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1"
            aria-labelledby={ariaId}
          >
            <h3 id={ariaId} className="text-sm sm:text-base font-extrabold text-stone-900">
              {question}
            </h3>
            <p
              className={`text-xs sm:text-sm leading-relaxed ${isMissing ? "text-stone-400 italic font-medium" : "text-stone-800 font-medium"}`}
            >
              {displayContent}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
