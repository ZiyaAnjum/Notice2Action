import { useContext } from "react";
import { LanguageContext } from "./language-context";

function useLanguageContext() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("Language hooks must be used within LanguageProvider");
  }
  return context;
}

export function useLanguage() {
  const { language, setLanguage } = useLanguageContext();
  return { language, setLanguage };
}
