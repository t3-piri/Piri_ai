import { useTheme } from "@/components/theme-provider";

export function MessageLoading({ size = 6 }: { size?: number }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className="flex items-center gap-1.5" aria-label="Yükleniyor">
      <span
        className="animate-bounce rounded-full"
        style={{
          width: size,
          height: size,
          background: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)",
          animationDelay: "0ms",
          animationDuration: "0.9s",
        }}
      />
      <span
        className="animate-bounce rounded-full"
        style={{
          width: size,
          height: size,
          background: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.55)",
          animationDelay: "140ms",
          animationDuration: "0.9s",
        }}
      />
      <span
        className="animate-bounce rounded-full"
        style={{
          width: size,
          height: size,
          background: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)",
          animationDelay: "280ms",
          animationDuration: "0.9s",
        }}
      />
      <span className="ml-2 text-xs font-medium tracking-wide opacity-60">
        Yazıyor...
      </span>
    </div>
  );
}

export default MessageLoading;
