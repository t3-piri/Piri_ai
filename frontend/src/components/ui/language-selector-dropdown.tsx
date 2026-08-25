import { cn } from "@/lib/utils";
import { useLanguage, type Lang } from "@/context/LanguageContext";

const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "tr", label: "TR", flag: "🇹🇷" },
  { code: "en", label: "EN", flag: "🇬🇧" },
];

export function Component({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full p-1 gap-1",
        "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-sm",
        className
      )}
      role="group"
      aria-label="Language"
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
            lang === l.code
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          )}
          aria-pressed={lang === l.code}
        >
          <span className="text-sm leading-none">{l.flag}</span>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export default Component;
