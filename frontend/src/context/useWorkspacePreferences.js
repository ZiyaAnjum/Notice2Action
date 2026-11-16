import { useContext } from "react";
import { WorkspacePreferencesContext } from "./workspace-preferences-context";

export function useWorkspacePreferences() {
  const context = useContext(WorkspacePreferencesContext);
  if (!context) {
    throw new Error(
      "useWorkspacePreferences must be used within WorkspacePreferencesProvider"
    );
  }
  return context;
}
