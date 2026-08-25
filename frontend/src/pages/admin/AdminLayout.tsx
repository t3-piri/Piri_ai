import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Activity,
  CalendarRange,
  Users,
  Settings,
  LogOut,
  Search,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { SidebarNav, type NavGroupData, type NavTone } from "@/components/ui/dashboard-sidebar";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Component as LanguageSelector } from "@/components/ui/language-selector-dropdown";
import { AdminCursorShadow } from "@/components/ui/admin-cursor-shadow";
import { NotificationBell } from "@/components/ui/notification-bell";
import { GlowCardStyles } from "@/components/ui/glow-card";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { apiGet } from "@/lib/api";

type SearchDoc = {
  document_id: string;
  file_name: string;
  kaynak_adi: string | null;
  competition: string | null;
};

type SectionId = "genel" | "kaynak" | "bilgi" | "etkinlik" | "kullanicilar" | "ayarlar";

const SECTION_ROUTES: Record<SectionId, string> = {
  genel: "/admin",
  kaynak: "/admin/kaynak-havuzu",
  bilgi: "/admin/bilgi-guncelleme",
  etkinlik: "/admin/etkinlik",
  kullanicilar: "/admin/kullanicilar",
  ayarlar: "/admin/ayarlar",
};

const SECTION_LABELS: Record<SectionId, { tr: string; en: string }> = {
  genel: { tr: "Genel Bakış", en: "Overview" },
  kaynak: { tr: "Kaynak Havuzu", en: "Source Pool" },
  bilgi: { tr: "Bilgi Güncelleme", en: "Knowledge Update" },
  etkinlik: { tr: "Etkinlik & Takvim", en: "Activity & Calendar" },
  kullanicilar: { tr: "Kullanıcılar & Roller", en: "Users & Roles" },
  ayarlar: { tr: "Ayarlar", en: "Settings" },
};

const SECTION_TONES: Record<SectionId, NavTone> = {
  genel: "violet",
  kaynak: "blue",
  bilgi: "amber",
  etkinlik: "cyan",
  kullanicilar: "emerald",
  ayarlar: "zinc",
};

function sectionFromPath(pathname: string): SectionId {
  if (pathname.startsWith("/admin/kaynak-havuzu")) return "kaynak";
  if (pathname.startsWith("/admin/bilgi-guncelleme")) return "bilgi";
  if (pathname.startsWith("/admin/etkinlik")) return "etkinlik";
  if (pathname.startsWith("/admin/kullanicilar")) return "kullanicilar";
  if (pathname.startsWith("/admin/ayarlar")) return "ayarlar";
  return "genel";
}

export default function AdminLayout() {
  const { can, logout } = useAuth();
  const { lang, t } = useLanguage();
  const { unreadQuestionCount } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(true);
  const [activeWs] = useState("Piri");

  const activeId = sectionFromPath(location.pathname);
  const onKaynak = activeId === "kaynak";
  const [searchInput, setSearchInput] = useState(() => (onKaynak ? searchParams.get("q") ?? "" : ""));
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLFormElement>(null);

  // Aramanin gercekten "bir sey bulup gosterdigini" gorebilmesi icin kaynak
  // havuzu listesi bir kez onceden cekilir; her tus vurusunda API'ye gitmek
  // yerine acilir listede istemci tarafinda filtrelenir.
  const canSearchSources = can("sources.view");
  const [sourceDocs, setSourceDocs] = useState<SearchDoc[]>([]);
  useEffect(() => {
    if (!canSearchSources) {
      setSourceDocs([]);
      return;
    }
    let cancelled = false;
    apiGet("/api/admin/documents")
      .then((res) => {
        if (!cancelled) setSourceDocs(res.documents || []);
      })
      .catch(() => {
        /* arama kutusu sonuc gostermeden sessizce bos kalir */
      });
    return () => {
      cancelled = true;
    };
  }, [canSearchSources]);

  const searchResults = useMemo(() => {
    const q = searchInput.trim().toLocaleLowerCase("tr");
    if (!q) return [];
    const seen = new Set<string>();
    const out: SearchDoc[] = [];
    for (const d of sourceDocs) {
      if (seen.has(d.document_id)) continue;
      const haystack = [d.file_name, d.kaynak_adi, d.competition].filter(Boolean).join(" ").toLocaleLowerCase("tr");
      if (!haystack.includes(q)) continue;
      seen.add(d.document_id);
      out.push(d);
      if (out.length >= 8) break;
    }
    return out;
  }, [sourceDocs, searchInput]);

  // Kaynak Havuzu disina cikildiginda arama kutusunu sifirla; baska bir
  // sekmeden url'yle dogrudan ?q= ile gelinirse alani onunla senkronla.
  useEffect(() => {
    setSearchInput(onKaynak ? searchParams.get("q") ?? "" : "");
    setSearchOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setSearchOpen(true);
    if (onKaynak) {
      const next = new URLSearchParams(searchParams);
      if (value) next.set("q", value);
      else next.delete("q");
      setSearchParams(next, { replace: true });
    }
  }

  function goToDoc(doc: SearchDoc) {
    const label = doc.kaynak_adi || doc.file_name;
    setSearchInput(label);
    setSearchOpen(false);
    navigate(`/admin/kaynak-havuzu?q=${encodeURIComponent(label)}`);
  }

  function handleSearchSubmit() {
    if (searchResults.length > 0) {
      goToDoc(searchResults[0]);
      return;
    }
    const value = searchInput.trim();
    if (!value || onKaynak) return;
    navigate(`/admin/kaynak-havuzu?q=${encodeURIComponent(value)}`);
    setSearchOpen(false);
  }

  const label = (id: SectionId) => SECTION_LABELS[id][lang];

  const groups: NavGroupData[] = useMemo(() => {
    const items: { id: SectionId; title: string; icon: ElementType; tone: NavTone; badge?: number }[] = [
      { id: "genel", title: label("genel"), icon: LayoutDashboard, tone: SECTION_TONES.genel },
    ];
    if (can("sources.view")) items.push({ id: "kaynak", title: label("kaynak"), icon: FolderKanban, tone: SECTION_TONES.kaynak });
    if (can("questions.view")) {
      items.push({ id: "bilgi", title: label("bilgi"), icon: Activity, tone: SECTION_TONES.bilgi, badge: unreadQuestionCount });
      items.push({ id: "etkinlik", title: label("etkinlik"), icon: CalendarRange, tone: SECTION_TONES.etkinlik });
    }
    if (can("users.view")) items.push({ id: "kullanicilar", title: label("kullanicilar"), icon: Users, tone: SECTION_TONES.kullanicilar });

    return [
      { items },
      {
        heading: t("admin.system"),
        items: [
          { id: "ayarlar", title: label("ayarlar"), icon: Settings, tone: SECTION_TONES.ayarlar },
          { id: "cikis", title: t("admin.logout"), icon: LogOut, tone: "rose" },
        ],
      },
    ];
  }, [can, lang, t, unreadQuestionCount]);

  function handleSelect(id: string) {
    if (id === "cikis") {
      void logout().then(() => navigate("/", { replace: true }));
      return;
    }
    const route = SECTION_ROUTES[id as SectionId];
    if (route) navigate(route);
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      <GlowCardStyles />
      <AdminCursorShadow />
      <div className="flex w-full max-w-[1400px] mx-auto my-6 bg-transparent border border-zinc-200 dark:border-white/10 rounded-none md:rounded-xl overflow-hidden shadow-xl">
        <div className={`shrink-0 overflow-hidden border-r border-zinc-200 dark:border-white/10 transition-all duration-300 ${isOpen ? "w-[260px]" : "w-0 border-none"}`}>
          <SidebarNav
            className="w-[260px] h-full bg-white dark:bg-zinc-900 border-none"
            activeId={activeId}
            onSelect={handleSelect}
            activeWorkspace={activeWs}
            groups={groups}
            bottomItems={[]}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-transparent">
          <div className="h-14 border-b border-zinc-200 dark:border-white/10 flex items-center px-4 justify-between bg-white dark:bg-zinc-900 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </button>
              <span className="text-sm text-zinc-500 hidden md:inline">Piri</span>
              <span className="text-sm text-zinc-400">/</span>
              <span className="text-sm font-medium text-zinc-900 dark:text-white">{label(activeId)}</span>
            </div>
            <div className="flex items-center gap-2">
              <form
                ref={searchRef}
                className="relative hidden lg:flex items-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearchSubmit();
                }}
              >
                <Search size={14} className="absolute left-2.5 text-zinc-400" />
                <input
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchInput && setSearchOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchOpen(false);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder={t("admin.searchPlaceholder")}
                  className="h-8 w-56 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 pl-8 pr-3 text-sm outline-none"
                />
                {searchOpen && searchInput.trim() && (
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-2xl overflow-hidden z-50">
                    {searchResults.length === 0 && (
                      <p className="px-4 py-3 text-xs text-zinc-400">
                        {canSearchSources ? "Eşleşen kaynak bulunamadı." : "Kaynak havuzunu görüntüleme yetkiniz yok."}
                      </p>
                    )}
                    {searchResults.map((doc) => (
                      <button
                        key={doc.document_id}
                        type="button"
                        onClick={() => goToDoc(doc)}
                        className="w-full text-left px-3 py-2 flex items-center gap-2.5 border-b border-zinc-50 dark:border-white/[0.04] last:border-0 hover:bg-zinc-50 dark:hover:bg-white/[0.05] transition-colors"
                      >
                        <FileText size={14} className="text-zinc-400 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-zinc-900 dark:text-white truncate">
                            {doc.kaynak_adi || doc.file_name}
                          </span>
                          <span className="block text-[11px] text-zinc-500 truncate">{doc.competition || "Genel"}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </form>
              <NotificationBell />
              <LanguageSelector />
              <ThemeSwitcher />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 md:p-8 space-y-8">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
