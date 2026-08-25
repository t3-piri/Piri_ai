import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";

export function AdminCursorShadow() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [pos, setPos] = useState({ x: -500, y: -500 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };
    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
      {/* admin'e özel hafif gölge — bulanık değil, keskin, az parlak */}
      <div
        className="absolute rounded-full"
        style={{
          left: pos.x - 160,
          top: pos.y - 160,
          width: 320,
          height: 320,
          background: isDark
            ? "radial-gradient(circle at center, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 28%, transparent 62%)"
            : "radial-gradient(circle at center, rgba(15,36,66,0.045) 0%, rgba(15,36,66,0.012) 30%, transparent 62%)",
          transition: "left 0.06s linear, top 0.06s linear",
          willChange: "left, top",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: pos.x - 2,
          top: pos.y - 2,
          width: 4,
          height: 4,
          background: isDark ? "rgba(255,255,255,0.55)" : "rgba(15,36,66,0.5)",
          boxShadow: isDark ? "0 0 6px rgba(255,255,255,0.25)" : "0 0 5px rgba(15,36,66,0.15)",
        }}
      />
    </div>
  );
}

export function SpotlightCard({ children, className = "", isDark }: { children: React.ReactNode; className?: string; isDark?: boolean }) {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [hover, setHover] = useState(false);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: hover ? 1 : 0,
          background: `radial-gradient(300px circle at ${pos.x}% ${pos.y}%, ${isDark ? "rgba(255,255,255,0.035)" : "rgba(15,36,66,0.04)"} 0%, transparent 60%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-200"
        style={{
          opacity: hover ? 1 : 0,
          background: `radial-gradient(260px circle at ${pos.x}% ${pos.y}%, ${isDark ? "rgba(255,255,255,0.05)" : "rgba(15,36,66,0.045)"} 0%, transparent 58%)`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "1px",
        }}
      />
    </div>
  );
}
