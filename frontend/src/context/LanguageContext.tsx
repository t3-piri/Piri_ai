import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "tr" | "en";

const STORAGE_KEY = "piri_lang";

const STRINGS = {
  "chat.placeholder": { tr: "Bir soru sorun...", en: "Ask a question..." },
  "chat.general": { tr: "Genel", en: "General" },
  "chat.competitionHint": { tr: "Yarışma seç", en: "Choose a competition" },
  "chat.generalAll": { tr: "🌐 Genel (tüm yarışmalar)", en: "🌐 General (all competitions)" },
  "chat.send": { tr: "Gönder", en: "Send" },
  "chat.stop": { tr: "Durdur", en: "Stop" },
  "chat.networkError": { tr: "Bir hata oluştu, tekrar deneyin.", en: "Something went wrong, please try again." },
  "chat.confidenceHigh": { tr: "✓ Yüksek güven", en: "✓ High confidence" },
  "chat.confidenceMid": { tr: "~ Orta güven", en: "~ Medium confidence" },
  "chat.confidenceLow": { tr: "Düşük güven", en: "Low confidence" },
  "chat.confidenceGeneral": { tr: "Genel kaynak", en: "General source" },
  "chat.feedbackUp": { tr: "Bu yanıt yardımcı oldu", en: "This answer was helpful" },
  "chat.feedbackDown": { tr: "Bu yanıt yardımcı olmadı", en: "This answer was not helpful" },
  "login.title": { tr: "Tekrar hoş geldin", en: "Welcome back" },
  "login.subtitle": { tr: "Yönetim paneline erişmek için bilgilerini gir.", en: "Enter your details to access the admin panel." },
  "login.username": { tr: "Kullanıcı adı", en: "Username" },
  "login.usernamePlaceholder": { tr: "kullanici_adi", en: "username" },
  "login.password": { tr: "Şifre", en: "Password" },
  "login.remember": { tr: "Beni hatırla", en: "Remember me" },
  "login.submit": { tr: "Giriş yap", en: "Sign in" },
  "login.submitting": { tr: "Giriş yapılıyor...", en: "Signing in..." },
  "login.footer": { tr: "Erişim için sistem yöneticinizle iletişime geçin.", en: "Contact your system administrator for access." },
  "login.secure": { tr: "Korumalı bağlantı • 256-bit şifreleme", en: "Secure connection • 256-bit encryption" },
  "login.badge": { tr: "Admin Girişi", en: "Admin Login" },
  "login.safe": { tr: "Güvenli", en: "Secure" },
  "login.genericError": { tr: "Giriş başarısız.", en: "Sign in failed." },
  "admin.searchPlaceholder": { tr: "Kaynak havuzunda ara...", en: "Search the source pool..." },
  "admin.logout": { tr: "Oturumu Kapat", en: "Log out" },
  "admin.system": { tr: "Sistem", en: "System" },
  "admin.section.genel": { tr: "Genel Bakış", en: "Overview" },
  "admin.section.kaynak": { tr: "Kaynak Havuzu", en: "Source Pool" },
  "admin.section.bilgi": { tr: "Bilgi Güncelleme", en: "Knowledge Update" },
  "admin.section.kullanicilar": { tr: "Kullanıcılar & Roller", en: "Users & Roles" },
  "admin.section.ayarlar": { tr: "Ayarlar", en: "Settings" },
  "notif.title": { tr: "Bildirimler", en: "Notifications" },
  "notif.empty": { tr: "Bildirim yok.", en: "No notifications." },
  "notif.markAll": { tr: "Tümünü okundu işaretle", en: "Mark all as read" },
  "calendar.title": { tr: "Etkinlik Yoğunluğu", en: "Activity Intensity" },
  "calendar.hint": { tr: "ay üzerine gel · yıl = toplam", en: "hover a month · year = total" },
  "calendar.year": { tr: "Yıl", en: "Yr" },
  "calendar.growth": { tr: "aylık kümülatif soru sayısı · Oca→Ara", en: "cumulative question count · Jan→Dec" },
} as const;

export type StringKey = keyof typeof STRINGS;

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: StringKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "en" ? "en" : "tr";
  } catch {
    return "tr";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private-mode/blocked storage */
    }
  }, []);

  const t = useCallback((key: StringKey) => STRINGS[key][lang], [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
