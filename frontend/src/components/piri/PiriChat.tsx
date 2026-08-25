import { useState, useRef, useEffect } from "react";
import { PiriLogo } from "./PiriLogo";
import { BorderBeam } from "@/components/ui/border-beam";
import { MessageLoading } from "@/components/ui/message-loading";
import { useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react";
import { Component as LanguageSelector } from "@/components/ui/language-selector-dropdown";

type Msg = { role: "user" | "assistant"; text: string };

export function PiriChatTop() {
  const { theme, raw, setTheme } = useTheme();
  const isDark = theme === "dark";
  // header is always navy as per screenshot, toggle only affects body
  return (
    <div className="relative overflow-hidden" style={{ background: "#0e2442" }}>
      {/* subtle star field */}
      <div className="absolute inset-0 pointer-events-none opacity-40" style={{
        backgroundImage: `radial-gradient(1.2px 1.2px at 12% 22%, rgba(255,255,255,0.9) 0, transparent 60%), radial-gradient(1px 1px at 78% 18%, rgba(255,255,255,0.7) 0, transparent 60%), radial-gradient(1px 1px at 45% 78%, rgba(255,255,255,0.5) 0, transparent 60%), radial-gradient(1px 1px at 88% 65%, rgba(255,255,255,0.6) 0, transparent 60%), radial-gradient(1px 1px at 28% 88%, rgba(255,255,255,0.4) 0, transparent 60%)`
      }} />
      {/* top bar */}
      <div className="relative max-w-[1120px] mx-auto px-5 h-[56px] flex items-center justify-between">
        <PiriLogo />
        <div className="flex items-center gap-3">
          <div className="hidden md:flex">
            <LanguageSelector />
          </div>
          <button
            onClick={() => setTheme(raw === "dark" ? "light" : "dark")}
            className="w-9 h-9 rounded-full border border-white/15 bg-white/5 grid place-items-center text-white/80 hover:bg-white/10 hover:text-white transition"
            aria-label="tema"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
      {/* hero */}
      <div className="relative max-w-[1120px] mx-auto px-5 pt-8 pb-10 text-center">
        <h1 className="text-[28px] md:text-[34px] font-extrabold tracking-tight text-white">
          Şartnameye Dayalı Yanıtlar
        </h1>
        <p className="text-[13px] md:text-[14px] text-[#9fb3c8] mt-3 max-w-[760px] mx-auto leading-5">
          Sorunuzu doğrudan yazın. Yarışma adını yazarsanız o yarışmanın şartnamesinde, yazmazsanız genel kurallarda ararım.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {["Kaynak gösterimi", "Güven seviyesi", "Uydurma yanıt yok"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
              <span className="text-white">✓</span> {t}
            </span>
          ))}
        </div>
      </div>
      {/* curved corner accent */}
      <div className="absolute right-0 top-0 h-full w-[280px] pointer-events-none hidden md:block" style={{
        background: `linear-gradient(180deg, rgba(30,58,95,0.5), transparent)`,
        clipPath: "ellipse(80% 100% at 100% 0%)",
        opacity: 0.6
      }} />
    </div>
  );
}

export function PiriChatCard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [comp, setComp] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // initial demo messages as in screenshot
  useEffect(() => {
    setMsgs([
      // empty initially, screenshot shows one Q&A
    ]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading]);

  const send = () => {
    const t = input.trim();
    if (!t) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // simulate Piri logic: irrelevant -> yönlendir
      const irrelevant = /güneş|hava|saat|kaçta/i.test(t);
      if (irrelevant) {
        setMsgs((m) => [...m, { role: "assistant", text: "Bu soru TEKNOFEST yarışmalarıyla hiçbir ilgisi yok, bu nedenle destek ekibine yönlendiriyorum." }]);
      } else {
        const compSuffix = comp ? ` (${comp})` : "";
        setMsgs((m) => [...m, { role: "assistant", text: `Sorunuz${compSuffix} için şartnameye dayalı yanıt: Kaynaklarda ilgili madde bulundu. Güven seviyesi: yüksek. Detay için şartname sayfa 12'ye bakabilirsiniz.` }]);
      }
    }, 1100);
  };

  const competitions = ["Roket Yarışması", "Uluslararası Elektrikli Araç Yarışları", "Hyperloop Geliştirme", "Robolig"];

  return (
    <div className="max-w-[760px] mx-auto -mt-6 relative z-10 px-4">
      <div className={`rounded-[24px] overflow-hidden shadow-[0_20px_60px_rgba(15,36,66,0.18)] border ${isDark ? "bg-[#101c34] border-white/10" : "bg-white border-[#e2e8f0]"}`}>
        {/* messages */}
        <div ref={scrollRef} className="min-h-[280px] max-h-[420px] overflow-auto p-5 md:p-6 space-y-4">
          {msgs.length === 0 && !loading && (
            <div className={`text-center py-10 text-sm ${isDark ? "text-white/50" : "text-slate-400"}`}>
              Sorunuzu yazın — örnek: “Roket yarışması için takım kaç kişiden oluşmalı?”
            </div>
          )}

          {/* demo Q from screenshot if empty, show as initial example after first send? We show actual msgs */}
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "user" ? (
                <div className="flex items-start gap-2 max-w-[82%] justify-end">
                  <div className="rounded-[14px] rounded-br-[6px] bg-[#0f2442] text-white px-4 py-2.5 text-[13px] leading-5 font-medium">
                    {m.text}
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-[#0f2442] text-white grid place-items-center text-[11px] font-bold shrink-0 mt-0.5">SİZ</div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 max-w-[84%]">
                  <div className="w-7 h-7 rounded-lg bg-[#dc2626] grid place-items-center shrink-0 mt-0.5">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white grid place-items-center">
                      <span className="w-1 h-1 bg-white rounded-full" />
                    </span>
                  </div>
                  <div className={`rounded-[14px] rounded-bl-[6px] px-4 py-3 text-[13px] leading-5 border-l-[3px] ${isDark ? "bg-white/10 border-[#dc2626] text-white" : "bg-[#f0f6ff] border-[#dc2626] text-[#0f2442]"}`}>
                    {m.text}
                  </div>
                </div>
              )}
            </div>
          ))}
          {/* static example from screenshot when no msgs, to match pixel */}
          {msgs.length === 0 && (
            <div className="space-y-4 opacity-60 pointer-events-none select-none hidden">
              <div className="flex justify-end">
                <div className="rounded-[14px] bg-[#0f2442] text-white px-4 py-2.5 text-sm">güneş kaçta batar</div>
              </div>
            </div>
          )}
          {loading && (
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#dc2626] grid place-items-center shrink-0">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white" />
              </div>
              <div className={`rounded-[14px] px-4 py-3 ${isDark ? "bg-white/10" : "bg-[#f0f6ff]"}`}>
                <MessageLoading />
              </div>
            </div>
          )}
        </div>

        {/* yarışma seç */}
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-b ${isDark ? "bg-white/[0.04] border-white/10" : "bg-[#f0f6ff] border-[#e2e8f0]"}`}>
          <div className={`flex items-center gap-2 text-xs ${isDark ? "text-white/70" : "text-[#0f2442]/70"}`}>
            <span className="opacity-60">⛃</span>
            Yarışmalar hakkında bilgi almak istiyorsanız, sormak istediğiniz yarışmayı seçin.
          </div>
          <div className="relative">
            <select
              value={comp ?? ""}
              onChange={(e) => setComp(e.target.value || null)}
              className={`h-8 rounded-full border px-3 pr-6 text-xs font-medium appearance-none cursor-pointer ${isDark ? "bg-[#0f2442] border-white/15 text-white" : "bg-white border-[#0f2442] text-[#0f2442]"}`}
            >
              <option value="">Yarışma seç</option>
              {competitions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* input — BorderBeam preserved but Piri red */}
        <div className={`p-3 md:p-4 ${isDark ? "bg-[#0a1930]" : "bg-white"}`}>
          <BorderBeam size="md" colorVariant="colorful" theme={isDark ? "dark" : "light"} borderRadius={14} className="w-full">
            <div className={`flex items-center gap-2 rounded-[14px] border p-1.5 ${isDark ? "bg-white/5 border-white/10" : "bg-white border-[#dbe4f0]"}`}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Sorunuzu yazın..."
                className={`flex-1 h-10 rounded-[10px] px-3 text-sm outline-none border ${isDark ? "bg-[#0f2442] border-white/10 text-white placeholder:text-white/40" : "bg-white border-[#e2e8f0] text-[#0f2442] placeholder:text-[#94a3b8]"}`}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-[12px] bg-[#dc2626] hover:bg-[#c81e22] text-white grid place-items-center shadow-[0_6px_16px_rgba(220,38,38,0.35)] disabled:opacity-50 transition shrink-0"
                aria-label="Gönder"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </BorderBeam>
          <div className={`text-center text-[11px] mt-2 ${isDark ? "text-white/40" : "text-[#64748b]"}`}>
            Enter ile gönder · Shift+Enter ile alt satır
          </div>
        </div>
      </div>

      <div className={`text-center text-[11px] mt-4 ${isDark ? "text-white/40" : "text-[#64748b]"}`}>
        <span className="font-bold">Piri</span> — TEKNOFEST yarışmacı destek asistanı · Yanıtlar doğrulanmış şartname kaynaklarına dayanır
      </div>
    </div>
  );
}

export default function PiriChatPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PiriChatTop />
      <div className="flex-1 py-6 pb-10" style={{ background: "transparent" }}>
        <PiriChatCard />
      </div>
    </div>
  );
}
