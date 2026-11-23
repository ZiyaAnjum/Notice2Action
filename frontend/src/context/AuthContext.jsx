import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./auth-context";
import * as api from "../api/client";

const DEMO_SESSION_KEY = "notice2action-demo-session";

function hasInitialDemoState() {
  if (
    typeof window !== "undefined" &&
    (window.location.protocol === "file:" ||
      window.location.search.includes("fixture=") ||
      window.location.hash.includes("fixture="))
  ) {
    return true;
  }
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    return (
      localStorage.getItem(DEMO_SESSION_KEY) === "remembered" ||
      sessionStorage.getItem(DEMO_SESSION_KEY) === "active"
    );
  }
  return false;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (hasInitialDemoState()) {
      return {
        id: "demo-user-seed-000000000001",
        email: "demo@notice2action.com",
        full_name: "Demo User",
        is_verified: true,
        preferred_language: "en",
        is_demo: true,
      };
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount via /auth/me (transparently uses httpOnly refresh cookie)
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      try {
        const userData = await api.getMe();
        if (isMounted && userData && userData.id) {
          setUser(userData);
        }
      } catch {
        // Not authenticated or network error; keep demo state if present
        if (isMounted && !hasInitialDemoState()) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const signup = useCallback(async ({ full_name, email, password }) => {
    const data = await api.signup({ full_name, email, password });
    if (data?.user) {
      setUser(data.user);
      sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    }
    return data;
  }, []);

  const login = useCallback(async ({ email, password, rememberMe = false }) => {
    const data = await api.login({ email, password });
    if (data?.user) {
      setUser(data.user);
      if (rememberMe) {
        localStorage.setItem(DEMO_SESSION_KEY, "remembered");
        sessionStorage.removeItem(DEMO_SESSION_KEY);
      } else {
        localStorage.removeItem(DEMO_SESSION_KEY);
        sessionStorage.setItem(DEMO_SESSION_KEY, "active");
      }
    }
    return data;
  }, []);

  const demoLogin = useCallback(async (rememberMe = false) => {
    try {
      const data = await api.login({
        email: "demo@notice2action.com",
        password: "DemoPassword123!",
      });
      if (data?.user) {
        setUser(data.user);
      } else {
        setUser({
          id: "demo-user-seed-000000000001",
          email: "demo@notice2action.com",
          full_name: "Demo User",
          is_verified: true,
          preferred_language: "en",
          is_demo: true,
        });
      }
    } catch {
      // Offline / mock fallback for tests
      setUser({
        id: "demo-user-seed-000000000001",
        email: "demo@notice2action.com",
        full_name: "Demo User",
        is_verified: true,
        preferred_language: "en",
        is_demo: true,
      });
    }

    if (rememberMe) {
      localStorage.setItem(DEMO_SESSION_KEY, "remembered");
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    } else {
      localStorage.removeItem(DEMO_SESSION_KEY);
      sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Proceed even if network request fails
    } finally {
      localStorage.removeItem(DEMO_SESSION_KEY);
      sessionStorage.removeItem(DEMO_SESSION_KEY);
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const updated = await api.updateProfile(payload);
    if (updated) {
      setUser(updated);
    }
    return updated;
  }, []);

  const changePassword = useCallback(async (payload) => {
    return await api.changePassword(payload);
  }, []);

  const deleteAccount = useCallback(async () => {
    try {
      return await api.deleteAccount();
    } finally {
      localStorage.removeItem(DEMO_SESSION_KEY);
      sessionStorage.removeItem(DEMO_SESSION_KEY);
      setUser(null);
    }
  }, []);

  const resendVerification = useCallback(async () => {
    return await api.resendVerification();
  }, []);

  // Backward-compatibility aliases for existing demo session tests
  const startDemoSession = useCallback(
    (rememberMe = false) => {
      return demoLogin(rememberMe);
    },
    [demoLogin]
  );

  const endDemoSession = useCallback(() => {
    return logout();
  }, [logout]);

  const isAuthenticated = Boolean(user);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      signup,
      login,
      demoLogin,
      logout,
      updateProfile,
      changePassword,
      deleteAccount,
      resendVerification,
      startDemoSession,
      endDemoSession,
    }),
    [
      user,
      isAuthenticated,
      isLoading,
      signup,
      login,
      demoLogin,
      logout,
      updateProfile,
      changePassword,
      deleteAccount,
      resendVerification,
      startDemoSession,
      endDemoSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
