import { Routes, Route, Navigate } from "react-router-dom";
import TubesCursor from "@/components/ui/tubes-cursor";
import ChatPage from "@/pages/ChatPage";
import LoginPage from "@/pages/LoginPage";
import AdminLayout from "@/pages/admin/AdminLayout";
import OverviewPage from "@/pages/admin/OverviewPage";
import SourcesPage from "@/pages/admin/SourcesPage";
import KnowledgePage from "@/pages/admin/KnowledgePage";
import ActivityPage from "@/pages/admin/ActivityPage";
import UsersPage from "@/pages/admin/UsersPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import { RequireAuth } from "@/routes/RequireAuth";

export default function App() {
  return (
    <div className="min-h-screen relative">
      <TubesCursor />
      <div className="relative z-10 min-h-screen">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="kaynak-havuzu" element={<SourcesPage />} />
            <Route path="bilgi-guncelleme" element={<KnowledgePage />} />
            <Route path="etkinlik" element={<ActivityPage />} />
            <Route path="kullanicilar" element={<UsersPage />} />
            <Route path="ayarlar" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
