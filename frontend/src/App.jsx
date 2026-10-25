import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "./components/Header";
import { UploadPage } from "./pages/UploadPage";
import { NoticesListPage } from "./pages/NoticesListPage";
import { NoticeDashboardPage } from "./pages/NoticeDashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans antialiased selection:bg-indigo-600 selection:text-white">
        <Header />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/notices" element={<NoticesListPage />} />
            <Route path="/notices/:id" element={<NoticeDashboardPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
