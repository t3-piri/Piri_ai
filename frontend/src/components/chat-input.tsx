import { useState } from "react";
import { BorderBeam } from "@/components/ui/border-beam";
import { MessageLoading } from "@/components/ui/message-loading";
import { T3Logo } from "@/components/ui/t3-logo";
import { useTheme } from "@/components/theme-provider";

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(90deg)" }}>
      <path d="M7 11L10 8L7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
    </svg>
  );
}
function ArrowUpIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 12.6667V3.33333M12.6667 8L8 3.33333L3.33333 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChatbotPanel() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "Merhaba! Sana nasıl yardımcı olabilirim? ✨" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agent, setAgent] = useState("Agent");
  const [model, setModel] = useState("Auto");

  const send = () => {
    const t = input.trim();
    if (!t) return;
    setMessages((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `"${t}" için öneriler hazırladım. İstersen detaylandırabilirim.` },
      ]);
    }, 1300);
  };

  const chip = isDark
    ? "rgba(255,255,255,0.06)"
    : "rgba(0,0,0,0.04)";

  const CHIP: React.CSSProperties = {
    borderRadius: 36,
    background: chip,
    boxShadow: isDark
      ? "inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 0 rgba(255,255,255,0.06)"
      : "inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 0 rgba(255,255,255,0.9)",
  };

  return (
    <div className="w-full max-w-[640px] mx-auto flex flex-col gap-4">
      {/* messages — blur kaldırıldı, keskin kenar */}
      <div
        className={
          "rounded-[24px] p-4 md:p-5 min-h-[280px] max-h-[380px] overflow-auto flex flex-col gap-3 border " +
          (isDark ? "bg-zinc-900 border-white/10" : "bg-white border-zinc-200 shadow-sm")
        }
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-5 " +
              (m.role === "user"
                ? "self-end bg-violet-600 text-white rounded-br-md"
                : isDark
                  ? "self-start bg-white/10 text-zinc-100 border border-white/10 rounded-bl-md"
                  : "self-start bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-bl-md")
            }
          >
            {m.text}
          </div>
        ))}
        {loading && (
          <div
            className={
              "self-start rounded-2xl px-4 py-3 border rounded-bl-md " +
              (isDark ? "bg-white/10 border-white/10" : "bg-zinc-100 border-zinc-200")
            }
          >
            <MessageLoading />
          </div>
        )}
      </div>

      {/* input - original ChatInput ana yapı BOZULMADAN, sadece tema renkleri uyumlu */}
      <BorderBeam
        size="md"
        colorVariant="colorful"
        theme={isDark ? "dark" : "light"}
        className="w-full"
        borderRadius={20}
      >
        <div
          className="w-full rounded-[20px] overflow-hidden relative"
          style={{
            background: isDark ? "#1d1d1d" : "#ffffff",
            boxShadow: isDark
              ? "inset 0 0 0 1px rgba(44,47,54,0.52), inset 0 0 50px 0 rgba(255,255,255,0.02)"
              : "inset 0 0 0 1px rgba(0,0,0,0.08), 0 4px 20px rgba(0,0,0,0.06)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ padding: "7px 7px 8px", display: "flex", flexDirection: "column", height: 122 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                width: "fit-content",
                height: 24,
                padding: "0 8px",
                marginLeft: 1,
                ...CHIP,
                color: isDark ? "#ffffff" : "#18181b",
              }}
            >
              <T3Logo size={17} />
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Build anything..."
              className="bg-transparent outline-none border-none text-[13px] leading-4 px-1 pt-4 placeholder:text-[#4e4e4e] dark:placeholder:text-zinc-500"
              style={{ color: isDark ? "#e5e7eb" : "#111827" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
              <button
                onClick={() => setAgent((a) => (a === "Agent" ? "Ask" : "Agent"))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  height: 24,
                  padding: "0 6px 0 8px",
                  fontSize: 12,
                  lineHeight: "14px",
                  color: isDark ? "#caccd2" : "#374151",
                  marginLeft: 1,
                  ...CHIP,
                }}
              >
                {agent}
                <ChevronDownIcon />
              </button>
              <button
                onClick={() => setModel((m) => (m === "Auto" ? "Pro" : "Auto"))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  height: 24,
                  padding: "0 6px 0 8px",
                  fontSize: 12,
                  lineHeight: "14px",
                  color: isDark ? "#caccd2" : "#374151",
                  ...CHIP,
                }}
              >
                {model}
                <ChevronDownIcon />
              </button>
              <button
                onClick={send}
                aria-label="Gönder"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  marginLeft: "auto",
                  padding: "0 8px",
                  ...CHIP,
                  color: isDark ? "#9aa0a6" : "#374151",
                  cursor: "pointer",
                }}
              >
                <ArrowUpIcon />
              </button>
            </div>
          </div>
        </div>
      </BorderBeam>
      <p className={"text-center text-[11px] " + (isDark ? "text-zinc-500" : "text-zinc-500")}>
        Enter ile gönder • Agent / Auto değiştirilebilir • Border beam aktif
      </p>
    </div>
  );
}
