import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "./components/Header";
import { UploadPage } from "./pages/UploadPage";
import { NoticesListPage } from "./pages/NoticesListPage";
import { NoticeDashboardPage } from "./pages/NoticeDashboardPage";

export default function App() {
  return (
    <BrowserRouter>
        <div className="min-h-screen mesh-gradient-canvas flex flex-col text-slate-900 font-sans antialiased selection:bg-royal-600 selection:text-white">
          <Header />
            <div className="flex-1 flex flex-col">
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
