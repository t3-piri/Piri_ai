import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import { MessageLoading } from "@/components/ui/message-loading";
import { T3Logo } from "@/components/ui/t3-logo";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Component as LanguageSelector } from "@/components/ui/language-selector-dropdown";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/context/LanguageContext";
import { apiPost, apiGet, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const COMPETITION_KEY = "piri_competition";
// Takip sorularının ("ödül ne" gibi) önceki mesaja bakılarak anlaşılabilmesi
// için backend'e gönderilen sohbet geçmişi penceresi. Modelin bağlam
// penceresinin (32.768 token) çok altında, pratikte hiç dolmayacak kadar
// geniş bir sınır — kullanıcıyla birlikte kararlaştırıldı.
const HISTORY_WINDOW = 30;

/** Turkce buyuk/kucuk harf donusumu I/i/İ/ı harflerini normal Latin
 * kasidan farkli esler (toLocaleLowerCase("tr") ile "IHA" -> "ıha",
 * "İHA" -> "iha" olur - ikisi birbirini bulamaz). Arama icin once tum
 * I varyantlarini "i"ye sabitleyip sonra Turkce kucuk harfe ceviriyoruz,
 * boylece "IHA"/"İHA"/"iha"/"ıha" hepsi ayni sekilde eslesir. */
function foldTr(s: string) {
  return s.replace(/[İIı]/g, "i").toLocaleLowerCase("tr");
}

type Source = { file: string; locator: string; competition: string; score: number };

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  competitionOptions?: string[];
  pendingQuestion?: string;
  confidence?: string;
  logId?: string;
  feedback?: "up" | "down" | null;
};

function ArrowUpIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 12.6667V3.33333M12.6667 8L8 3.33333L3.33333 8" stroke="#8B8B8B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="3" width="10" height="10" rx="2" fill="#8B8B8B" />
    </svg>
  );
}

function ChevronDownSmIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" className={className}>
      <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const CHIP: React.CSSProperties = {
  borderRadius: 36,
  background: "rgba(255,255,255,0.04)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 0 rgba(255,255,255,0.04)",
};

let msgCounter = 0;
function nextId() {
  msgCounter += 1;
  return String(msgCounter);
}

function ConfidenceBadge({ confidence, isDark }: { confidence: string; isDark: boolean }) {
  const { t } = useLanguage();
  const isHigh = confidence === "high";
  const isMid = confidence === "mid";
  const isLow = confidence === "low";
  return (
    <span
      className={
        "text-[10px] px-2 py-0.5 rounded-full font-medium border " +
        (isHigh
          ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
          : isMid
          ? "bg-amber-500/15 text-amber-600 border-amber-500/20"
          : isLow
          ? "bg-red-500/15 text-red-500 border-red-500/20"
          : isDark
          ? "bg-white/5 text-zinc-400 border-white/10"
          : "bg-zinc-100 text-zinc-500 border-zinc-200")
      }
    >
      {isHigh ? t("chat.confidenceHigh") : isMid ? t("chat.confidenceMid") : isLow ? t("chat.confidenceLow") : t("chat.confidenceGeneral")}
    </span>
  );
}

function MessageBubble({
  msg,
  isDark,
  busy,
  onPick,
  onFeedback,
}: {
  msg: ChatMsg;
  isDark: boolean;
  busy: boolean;
  onPick: (competition: string, question: string) => void;
  onFeedback: (msgId: string, logId: string, satisfaction: "up" | "down") => void;
}) {
  const { t } = useLanguage();
  const isUser = msg.role === "user";
  return (
    <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap " +
          (isUser
            ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white"
            : isDark
            ? "bg-[#1d1d1d] text-zinc-100 border border-white/[0.06]"
            : "bg-white text-zinc-900 border border-zinc-200")
        }
      >
        {msg.text}
        {!isUser && (msg.confidence || msg.logId) && (
          <div className="mt-2 flex items-center gap-2">
            {msg.confidence && <ConfidenceBadge confidence={msg.confidence} isDark={isDark} />}
            {msg.logId && (
              <div className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  title={t("chat.feedbackUp")}
                  aria-label={t("chat.feedbackUp")}
                  onClick={() => onFeedback(msg.id, msg.logId!, "up")}
                  className={cn(
                    "p-1 rounded-full transition",
                    msg.feedback === "up"
                      ? "text-emerald-500 bg-emerald-500/15"
                      : isDark
                      ? "text-zinc-500 hover:text-zinc-300"
                      : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  <ThumbsUp size={13} />
                </button>
                <button
                  type="button"
                  title={t("chat.feedbackDown")}
                  aria-label={t("chat.feedbackDown")}
                  onClick={() => onFeedback(msg.id, msg.logId!, "down")}
                  className={cn(
                    "p-1 rounded-full transition",
                    msg.feedback === "down"
                      ? "text-red-500 bg-red-500/15"
                      : isDark
                      ? "text-zinc-500 hover:text-zinc-300"
                      : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  <ThumbsDown size={13} />
                </button>
              </div>
            )}
          </div>
        )}
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.sources.map((s, i) => (
              <span
                key={i}
                title={s.locator}
                className={
                  "text-[11px] px-2 py-0.5 rounded-full " +
                  (isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500")
                }
              >
                {s.file}
              </span>
            ))}
          </div>
        )}
        {msg.competitionOptions && msg.competitionOptions.length > 0 && (
          <div className="mt-3">
            <CompetitionSelector
              selected={null}
              competitions={msg.competitionOptions}
              hideGeneral
              onSelect={(name) => name && msg.pendingQuestion && !busy && onPick(name, msg.pendingQuestion)}
              isDark={isDark}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Yarışma seçici açılır liste — input kutusu içindeki chip'in tıklanmasıyla açılır.
 * Onlarca yarışma olabileceğinden hepsini tek seferde dökmek yerine sabit
 * yükseklikte, aranabilir ve kaydırılabilir bir panel gösterir. */
function CompetitionSelector({
  selected,
  competitions,
  generalLabel = "",
  hideGeneral = false,
  onSelect,
  isDark,
}: {
  selected: string | null;
  competitions: string[];
  generalLabel?: string;
  /** Mesaj icine gomulu "hangi yarışma?" secicisinde (bkz. MessageBubble)
   * "Genel (tüm yarışmalar)" secenegi anlamsiz - zaten genel aramanin
   * cevap veremedigi bir soru icin gosteriliyor. */
  hideGeneral?: boolean;
  onSelect: (name: string | null) => void;
  isDark: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Panel bir portal ile document.body'e tasinir: kart ve BorderBeam sarmalayicisi
  // overflow:hidden oldugundan, panel karta gomulu kalsaydi kesilirdi.
  useEffect(() => {
    if (!open) return;
    const updateCoords = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setCoords({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
    };
    updateCoords();
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", updateCoords, true);
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      const id = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = foldTr(query.trim());
    if (!q) return competitions;
    return competitions.filter((c) => foldTr(c).includes(q));
  }, [competitions, query]);
  const hasQuery = query.trim().length > 0;

  const label =
    selected && selected !== generalLabel
      ? selected
      : hideGeneral
      ? t("chat.competitionHint")
      : t("chat.general");
  const isActive = open || !!selected;

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 8px 0 10px",
          fontSize: 12.5, lineHeight: "15px",
          color: isActive ? "#fff" : isDark ? "#caccd2" : "#374151",
          borderRadius: 36,
          background: isActive ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"),
          boxShadow: isActive
            ? "0 1px 8px rgba(124,58,237,0.4), inset 0 1px 0 0 rgba(255,255,255,0.15)"
            : isDark
            ? "inset 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 0 rgba(255,255,255,0.04)"
            : "inset 0 0 0 1px rgba(0,0,0,0.02), inset 0 1px 0 0 rgba(255,255,255,0.04)",
        }}
        className="transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
        title={t("chat.competitionHint")}
      >
        <span className="max-w-[130px] truncate">{label}</span>
        <ChevronDownSmIcon className={cn("transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && coords &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", left: coords.left, bottom: coords.bottom }}
            className={cn(
              "rounded-xl border shadow-2xl z-50 w-[260px] overflow-hidden flex flex-col",
              isDark ? "bg-[#1d1d1d] border-white/10 text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"
            )}
          >
            <div className={cn("flex items-center gap-2 px-3 py-2 border-b shrink-0", isDark ? "border-white/10" : "border-zinc-100")}>
              <Search size={13} className="text-zinc-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("chat.competitionHint")}
                className="w-full bg-transparent outline-none border-none text-xs placeholder:text-zinc-400"
              />
            </div>
            <div className="py-1 max-h-[240px] overflow-y-auto overscroll-contain">
              {!hasQuery && !hideGeneral && (
                <button
                  onClick={() => { onSelect(generalLabel); setOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition flex items-center justify-between gap-2",
                    selected === generalLabel && "font-semibold text-violet-500"
                  )}
                >
                  <span>{t("chat.generalAll")}</span>
                  {selected === generalLabel && <Check size={13} />}
                </button>
              )}
              {filtered.map((c) => (
                <button
                  key={c}
                  onClick={() => { onSelect(c); setOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition flex items-center justify-between gap-2",
                    selected === c && "font-semibold text-violet-500"
                  )}
                >
                  <span className="truncate">{c}</span>
                  {selected === c && <Check size={13} className="shrink-0" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-4 py-3 text-xs text-zinc-400">—</p>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function ChatPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [competition, setCompetitionState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(COMPETITION_KEY);
    } catch {
      return null;
    }
  });
  const [competitions, setCompetitions] = useState<string[]>([]);
  // Backend'in "genel kapsam" icin kullandigi sabit deger (GENERAL_LABEL) -
  // /api/contexts'ten gelir. Kullanici acikca "Genel (tüm yarışmalar)" secince
  // bu deger gonderilir; boylece backend genel kaynaklarda net cevap
  // bulamasa bile dogrudan yaniti (ve kaydini) tamamlar, kullaniciya "hangi
  // yarışmayla ilgili?" diye sorup soruyu kayitsiz birakmaz (bkz. answer_in_context).
  const [generalLabel, setGeneralLabel] = useState("Genel");
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Yarışma listesini + genel kapsam etiketini yükle
  useEffect(() => {
    apiGet("/api/contexts")
      .then((data) => {
        setCompetitions(data.competitions || []);
        if (data.general_label) setGeneralLabel(data.general_label);
      })
      .catch(() => {/* ağ hatası: yarışma listesi olmadan da çalışır */});
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function setCompetition(name: string | null) {
    setCompetitionState(name);
    try {
      if (name) sessionStorage.setItem(COMPETITION_KEY, name);
      else sessionStorage.removeItem(COMPETITION_KEY);
    } catch {
      /* private-mode/blocked storage */
    }
  }

  async function ask(question: string, echo: boolean, contextOverride?: string | null) {
    if (echo) {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text: question }]);
    }
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const history = messages.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, text: m.text }));
      const data = await apiPost(
        "/api/ask",
        { question, context: contextOverride !== undefined ? contextOverride : competition, history },
        { signal: controller.signal }
      );
      if (data.current_competition) setCompetition(data.current_competition);
      // Güven seviyesini yalnızca gerçek bir yanıt için belirle - backend "answered"
      // dışındaki durumlarda da (technical_error, unrelated...) confidence alanını
      // doldurur, rozet yalnızca gerçek cevaplarda gösterilmeli.
      let confidence: string | undefined;
      if (data.status === "answered") {
        if (data.confidence === "Yüksek güven") confidence = "high";
        else if (data.confidence === "Orta güven") confidence = "mid";
        else confidence = "low";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: data.answer,
          sources: data.sources,
          confidence,
          competitionOptions: data.status === "needs_competition" ? data.competition_options : undefined,
          pendingQuestion: data.status === "needs_competition" ? question : undefined,
          logId: data.log_id ?? undefined,
          feedback: null,
        },
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof ApiError ? err.message : t("chat.networkError");
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: message }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function submit() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void ask(q, true);
  }

  function pickCompetition(name: string, question: string) {
    if (busy) return;
    setCompetition(name);
    void ask(question, false, name);
  }

  function sendFeedback(msgId: string, logId: string, satisfaction: "up" | "down") {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback: satisfaction } : m)));
    apiPost("/api/feedback", { log_id: logId, satisfaction }).catch(() => {
      /* iyimser guncelleme yeterli - agdaki basarisizlik sessizce yoksayilir */
    });
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <LanguageSelector />
        <ThemeSwitcher />
      </div>

      {hasMessages && (
        <div ref={listRef} className="flex-1 overflow-y-auto px-6 pt-20 pb-4">
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} isDark={isDark} busy={busy} onPick={pickCompetition} onFeedback={sendFeedback} />
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className={"rounded-2xl px-4 py-3 " + (isDark ? "bg-[#1d1d1d]" : "bg-zinc-100")}>
                  <MessageLoading />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={hasMessages ? "flex items-center justify-center px-6 pb-6 pt-2" : "flex-1 flex items-center justify-center p-6"}>
        <BorderBeam size="md" colorVariant="colorful" theme={isDark ? "dark" : "light"} borderRadius={20}>
          <div
            style={{
              width: 440,
              maxWidth: "92vw",
              borderRadius: 20,
              background: isDark ? "#1d1d1d" : "#ffffff",
              boxShadow: isDark
                ? "inset 0 0 0 1px rgba(44,47,54,0.52), inset 0 0 50px 0 rgba(255,255,255,0.02)"
                : "inset 0 0 0 1px rgba(0,0,0,0.08), 0 10px 32px rgba(0,0,0,0.08)",
              overflow: "hidden",
              position: "relative",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <div style={{ padding: "10px 10px 11px", display: "flex", flexDirection: "column", height: 150 }}>
              <div
                style={{ display: "inline-flex", alignItems: "center", width: "fit-content", height: 24, padding: "0 8px", ...CHIP }}
                className={isDark ? "text-white" : "text-zinc-900"}
              >
                <T3Logo size={17} />
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={t("chat.placeholder")}
                rows={1}
                className={isDark ? "placeholder:text-[#6b7280]" : "placeholder:text-[#9aa0a6]"}
                style={{
                  flex: 1,
                  resize: "none",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 14,
                  lineHeight: "18px",
                  color: isDark ? "#e5e7eb" : "#111827",
                  padding: "16px 5px 0",
                  fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
                {/* Yarışma seçici — Agent/Auto chip'lerinin yerinde */}
                <CompetitionSelector
                  selected={competition}
                  competitions={competitions}
                  generalLabel={generalLabel}
                  onSelect={setCompetition}
                  isDark={isDark}
                />
                <button
                  onClick={busy ? () => abortRef.current?.abort() : submit}
                  aria-label={busy ? t("chat.stop") : t("chat.send")}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, marginLeft: "auto", cursor: "pointer", ...CHIP, borderRadius: 999 }}
                >
                  {busy ? <StopIcon /> : <ArrowUpIcon />}
                </button>
              </div>
            </div>
          </div>
        </BorderBeam>
      </div>
    </div>
  );
}
