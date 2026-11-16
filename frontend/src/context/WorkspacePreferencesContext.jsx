import { useCallback, useMemo, useState } from "react";
import { SUPPORTED_CATEGORIES } from "../utils/categories";
import { WorkspacePreferencesContext } from "./workspace-preferences-context";

const STORAGE_KEY = "notice2action-focus-categories";
const SUPPORTED_KEYS = new Set(SUPPORTED_CATEGORIES.map(({ key }) => key));

function readStoredCategories() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];
  return [...new Set(saved.split(",").filter((key) => SUPPORTED_KEYS.has(key)))];
}

export function WorkspacePreferencesProvider({ children }) {
  const [focusCategories, setFocusCategoriesState] = useState(readStoredCategories);

  const setFocusCategories = useCallback((categories) => {
    const next = [...new Set(categories.filter((key) => SUPPORTED_KEYS.has(key)))];
    localStorage.setItem(STORAGE_KEY, next.join(","));
    setFocusCategoriesState(next);
  }, []);

  const value = useMemo(
    () => ({ focusCategories, setFocusCategories }),
    [focusCategories, setFocusCategories]
  );

  return (
    <WorkspacePreferencesContext.Provider value={value}>
      {children}
    </WorkspacePreferencesContext.Provider>
  );
}
