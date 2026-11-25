import { useContext } from "react";
import { LanguageContext } from "./language-context";

function useLanguageContext() {
  const context = useContext(LanguageContext);
  if (!context) {
    return { language: "en", setLanguage: () => {} };
  }
  return context;
}

export function useLanguage() {
  const { language, setLanguage } = useLanguageContext();
  return { language, setLanguage };
}
