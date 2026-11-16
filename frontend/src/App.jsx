import { BrowserRouter, Routes, Route } from "react-router-dom";
import { InstitutionalLayout } from "./components/InstitutionalLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { UploadPage } from "./pages/UploadPage";
import { NoticesListPage } from "./pages/NoticesListPage";
import { NoticeDashboardPage } from "./pages/NoticeDashboardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { RemindersPage } from "./pages/RemindersPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <InstitutionalLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/notices" element={<NoticesListPage />} />
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </InstitutionalLayout>
    </BrowserRouter>
  );
}
