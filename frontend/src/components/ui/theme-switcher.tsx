import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeSwitcher({ className }: { className?: string }) {
  const { raw, setTheme } = useTheme();
  const opts: { value: "light" | "dark" | "system"; icon: React.ReactNode; label: string }[] = [
    { value: "light", icon: <Sun size={15} />, label: "Açık" },
    { value: "dark", icon: <Moon size={15} />, label: "Koyu" },
    { value: "system", icon: <Monitor size={15} />, label: "Sistem" },
  ];
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full p-1 gap-1",
        "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-sm",
        className
      )}
    >
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => setTheme(o.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
            raw === o.value
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          )}
          aria-pressed={raw === o.value}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default ThemeSwitcher;
