import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Component as LanguageSelector } from "@/components/ui/language-selector-dropdown";
import { Component as SignInCard } from "@/components/ui/sign-in-card-2";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const from = (location.state as { from?: Location })?.from?.pathname || "/admin";

  if (ready && user) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <LanguageSelector />
        <ThemeSwitcher />
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <SignInCard onSuccess={() => navigate(from, { replace: true })} />
      </div>
    </div>
  );
}
