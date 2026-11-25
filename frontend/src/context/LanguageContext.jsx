import { useCallback, useEffect, useMemo, useState } from "react";
import { SUPPORTED_LANGUAGES, getTranslation } from "../utils/languages";
import { LanguageContext } from "./language-context";

const STORAGE_KEY = "notice2action-language";
const LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map(({ code }) => code));

function readStoredLanguage() {
  const savedLanguage = localStorage.getItem(STORAGE_KEY);
  return LANGUAGE_CODES.has(savedLanguage) ? savedLanguage : "en";
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage);

  const setLanguage = useCallback((nextLanguage) => {
    if (!LANGUAGE_CODES.has(nextLanguage)) {
      throw new RangeError(`Unsupported language: ${nextLanguage}`);
    }
    setLanguageState(nextLanguage);
  }, []);

  const translate = useCallback(
    (key) => getTranslation(language, key),
    [language]
  );

  useEffect(() => {
    const selectedLanguage = SUPPORTED_LANGUAGES.find(({ code }) => code === language);
    document.documentElement.lang = selectedLanguage.locale;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t: translate }),
    [language, setLanguage, translate]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
