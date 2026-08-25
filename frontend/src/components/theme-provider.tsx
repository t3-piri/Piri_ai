import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const ThemeContext = createContext<{
  theme: ResolvedTheme;
  raw: Theme;
  setTheme: (t: Theme) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [raw, setRaw] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("theme") as Theme | null;
      if (saved) return saved;
    } catch {
      /* private-mode/blocked storage: kaydedilmis tema olmadan da calisir */
    }
    return "dark";
  });
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const compute = () => {
      const r: ResolvedTheme = raw === "system" ? (mq.matches ? "dark" : "light") : raw;
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
      document.documentElement.style.colorScheme = r;
    };
    compute();
    mq.addEventListener("change", compute);
    return () => mq.removeEventListener("change", compute);
  }, [raw]);

  const setTheme = (t: Theme) => {
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* private-mode/blocked storage */
    }
    setRaw(t);
  };

  return (
    <ThemeContext.Provider value={{ theme: resolved, raw, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
