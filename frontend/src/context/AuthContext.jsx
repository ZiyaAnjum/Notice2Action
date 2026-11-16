import { useCallback, useMemo, useState } from "react";
import { AuthContext } from "./auth-context";

const DEMO_SESSION_KEY = "notice2action-demo-session";

function hasDemoSession() {
  return (
    localStorage.getItem(DEMO_SESSION_KEY) === "remembered" ||
    sessionStorage.getItem(DEMO_SESSION_KEY) === "active"
  );
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(hasDemoSession);

  const startDemoSession = useCallback((rememberMe = false) => {
    if (rememberMe) {
      localStorage.setItem(DEMO_SESSION_KEY, "remembered");
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    } else {
      localStorage.removeItem(DEMO_SESSION_KEY);
      sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    }
    setIsAuthenticated(true);
  }, []);

  const endDemoSession = useCallback(() => {
    localStorage.removeItem(DEMO_SESSION_KEY);
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    setIsAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, startDemoSession, endDemoSession }),
    [isAuthenticated, startDemoSession, endDemoSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
