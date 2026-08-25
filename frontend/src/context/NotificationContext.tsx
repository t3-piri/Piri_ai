import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export type NotificationKind = "question" | "source" | "frequent" | "error" | "ambiguous" | "flag";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  timestamp: string;
  href: string;
};

const READ_KEY = "piri_read_notifications";
const POLL_MS = 60_000;

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistSeen(ids: Set<string>) {
  try {
    // Sinirsiz buyumesini engelle: yalnizca en son 500 kimlik saklanir.
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids).slice(-500)));
  } catch {
    /* private-mode/blocked storage */
  }
}

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  /** yalnizca soru kaynakli okunmamislar - "Bilgi Guncelleme" rozeti icin */
  unreadQuestionCount: number;
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  refresh: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, can } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [seen, setSeen] = useState<Set<string>>(readSeen);

  const canViewQuestions = can("questions.view");
  const canViewSources = can("sources.view");

  // Kimlik degistiginde (cikis/farkli kullanici girisi) bir onceki refresh()
  // cagrisinin gec gelen sonucu state'i ezmesin diye nesil sayaci tutulur.
  const identityRef = useRef(0);
  useEffect(() => {
    identityRef.current += 1;
  }, [user]);

  const refresh = useCallback(async () => {
    const myIdentity = identityRef.current;
    if (!user) {
      setNotifications([]);
      return;
    }

    const next: AppNotification[] = [];

    if (canViewQuestions) {
      try {
        const data = await apiGet("/api/admin/unanswered");
        for (const q of (data.unanswered || []).slice(0, 30)) {
          next.push({
            id: `q:${q.timestamp}:${q.question}`,
            kind: "question",
            title: "Yanıtsız soru",
            detail: q.question,
            timestamp: q.timestamp,
            href: "/admin/bilgi-guncelleme",
          });
        }
        for (const f of (data.frequent || []).slice(0, 10)) {
          next.push({
            id: `f:${f.competition}:${f.question}`,
            kind: "frequent",
            title: `${f.count} kez soruldu`,
            detail: f.question,
            timestamp: f.last_asked,
            href: "/admin/bilgi-guncelleme",
          });
        }
        // Bilgi bosluğu degil, kullanici tarafinda LLM cagrisinin teknik
        // nedenle basarisiz oldugu durumlar (bkz. qa_log.technical_errors) -
        // ayri bir bildirim turu olarak Etkinlik sayfasina yonlendirir.
        for (const err of (data.technical_errors || []).slice(0, 20)) {
          next.push({
            id: `t:${err.timestamp}:${err.question}`,
            kind: "error",
            title: "Teknik hata",
            detail: err.question,
            timestamp: err.timestamp,
            href: "/admin/etkinlik",
          });
        }
        // Kullanicinin sorusu hangi yarismayla ilgili oldugu belirlenemedigi
        // icin yanitsiz kalmis (bkz. qa_log.needs_competition_questions) -
        // sabit bir yarisma kapsami olmadigindan SSS akisina degil, Etkinlik
        // sayfasina yonlendirir.
        for (const nc of (data.needs_competition || []).slice(0, 20)) {
          next.push({
            id: `n:${nc.timestamp}:${nc.question}`,
            kind: "ambiguous",
            title: "Yarışma belirsiz",
            detail: nc.question,
            timestamp: nc.timestamp,
            href: "/admin/etkinlik",
          });
        }
        // Kullanicinin, RAG bir cevap/yonlendirme uretebilmis olsa BILE
        // ('answered' dahil), SU AN yasadigi somut bir teknik/sistemsel
        // sorunu bildirdigi kayitlar (bkz. qa_log.flagged_reports) - otomatik
        // cevap verilmis olmasi sikayetin cozuldugu anlamina gelmez.
        for (const rep of (data.flagged || []).slice(0, 20)) {
          next.push({
            id: `r:${rep.timestamp}:${rep.question}`,
            kind: "flag",
            title: "Kullanıcı sorun bildirdi",
            detail: rep.question,
            timestamp: rep.timestamp,
            href: "/admin/etkinlik",
          });
        }
      } catch {
        /* yetki/ag hatasi: bildirim listesi bos kalir, panel calismaya devam eder */
      }
    }

    if (canViewSources) {
      try {
        const data = await apiGet("/api/admin/documents");
        const now = Date.now();
        for (const d of data.documents || []) {
          if (d.status !== "active" || !d.gecerlilik_bitis) continue;
          // gecerlilik_bitis yalnizca tarih icerir ("YYYY-MM-DD"); bunu ciplak
          // `new Date(...)`'e vermek UTC gece yarisini dogurur ve saat farki
          // olumlu (Turkiye gibi UTC+) bolgelerde belgeyi gunun erken saatlerinde
          // erken "suresi dolmus" gosterir. Yerel gunun sonuyla kiyaslaniyor.
          if (new Date(`${d.gecerlilik_bitis}T23:59:59`).getTime() >= now) continue;
          next.push({
            id: `s:${d.document_id}:${d.version}`,
            kind: "source",
            title: "Süresi dolmuş kaynak",
            detail: `${d.kaynak_adi || d.file_name} · ${d.gecerlilik_bitis}`,
            timestamp: d.gecerlilik_bitis,
            href: "/admin/kaynak-havuzu",
          });
        }
      } catch {
        /* yetki/ag hatasi */
      }
    }

    next.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (identityRef.current !== myIdentity) return; // daha yeni bir kimlik/refresh basladi, bu sonuc bayat
    setNotifications(next.slice(0, 50));
  }, [user, canViewQuestions, canViewSources]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Kalicilastirma bir yan etkidir; setState guncelleyicisi SAF kalmali (React
  // Strict Mode / concurrent render'da birden fazla veya iptal edilen bir
  // render icin cagrilabilir) - bu yuzden yazma islemi `seen` degistiginde
  // calisan ayri bir effect'e tasindi.
  useEffect(() => {
    persistSeen(seen);
  }, [seen]);

  const markRead = useCallback((id: string) => {
    setSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const markAllRead = useCallback(() => {
    setSeen((prev) => {
      const next = new Set(prev);
      for (const n of notifications) next.add(n.id);
      return next;
    });
  }, [notifications]);

  const isRead = useCallback((id: string) => seen.has(id), [seen]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !seen.has(n.id)).length,
    [notifications, seen]
  );

  const unreadQuestionCount = useMemo(
    () => notifications.filter((n) => n.kind !== "source" && !seen.has(n.id)).length,
    [notifications, seen]
  );

  const value = useMemo(
    () => ({ notifications, unreadCount, unreadQuestionCount, isRead, markRead, markAllRead, refresh }),
    [notifications, unreadCount, unreadQuestionCount, isRead, markRead, markAllRead, refresh]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
