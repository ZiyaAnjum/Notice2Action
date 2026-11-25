import { BrowserRouter, HashRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { InstitutionalLayout } from "./components/InstitutionalLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { UploadPage } from "./pages/UploadPage";
import { NoticesListPage } from "./pages/NoticesListPage";
import { NoticeDashboardPage } from "./pages/NoticeDashboardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { RemindersPage } from "./pages/RemindersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AuthPage } from "./pages/AuthPage";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";
import { WorkspacePreferencesProvider } from "./context/WorkspacePreferencesContext";
import { LanguageProvider } from "./context/LanguageContext";

function RequireAuthentication() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

function GuestOnly({ mode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <AuthPage mode={mode} />;
}

export function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <LanguageProvider>
      <Routes>
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />}
      />
      <Route path="/login" element={<GuestOnly mode="login" />} />
      <Route path="/signup" element={<GuestOnly mode="signup" />} />
      <Route path="/forgot-password" element={<GuestOnly mode="forgot-password" />} />
      <Route path="/reset-password" element={<GuestOnly mode="reset-password" />} />

      <Route element={<RequireAuthentication />}>
        <Route element={<InstitutionalLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/notices" element={<NoticesListPage />} />
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LanguageProvider>
  );
}

export default function App() {
  const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";
  const RouterComponent = isFileProtocol ? HashRouter : BrowserRouter;

  return (
    <RouterComponent>
      <WorkspacePreferencesProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </WorkspacePreferencesProvider>
    </RouterComponent>
  );
}