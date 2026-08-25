import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";

const EASE = [0.16, 1, 0.3, 1] as const;
const ACCENT = "#7c3aed";
const WARN = "#f59e0b";

const INITIALS_TR = ["O", "Ş", "M", "N", "M", "H", "T", "A", "E", "E", "K", "A"];
const INITIALS_EN = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type ActivityCell = {
  /** o ay icinde gelen toplam soru */
  total: number;
  /** bunlarin kaci insana yonlendirildi */
  referred: number;
};

export type ActivityYear = {
  year: number;
  months: ActivityCell[];
};

/** Bir hucrenin dolgusu: yogunluga gore tonlanir, yonlendirme orani yuksekse
 *  amber'e kayar (sorun sinyali), aksi halde mor (saglikli hacim). */
function cellFill(cell: ActivityCell, max: number, active: boolean) {
  if (cell.total === 0) return "transparent";
  const referralRate = cell.referred / cell.total;
  const hue = referralRate > 0.4 ? WARN : ACCENT;
  const intensity = Math.round((cell.total / max) * 55 + (active ? 25 : 8));
  return `color-mix(in srgb, ${hue} ${intensity}%, transparent)`;
}

export function ActivityCalendar({
  data,
  className,
}: {
  data: ActivityYear[];
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { lang, t } = useLanguage();
  const [hot, setHot] = useState<{ y: number; m: number } | null>(null);

  const initials = lang === "tr" ? INITIALS_TR : INITIALS_EN;
  const months = lang === "tr" ? MONTHS_TR : MONTHS_EN;

  const max = useMemo(() => {
    let m = 1;
    for (const row of data) for (const c of row.months) m = Math.max(m, c.total);
    return m;
  }, [data]);

  const totals = useMemo(
    () => data.map((row) => row.months.reduce((sum, c) => sum + c.total, 0)),
    [data]
  );

  const hotCell = hot ? data[hot.y]?.months[hot.m] : undefined;

  if (data.length === 0) {
    return <p className="text-xs text-zinc-400">—</p>;
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <span className="text-[11px] tabular-nums text-zinc-500">
          {hot && hotCell ? (
            <>
              <span className="text-zinc-900 dark:text-white font-medium">
                {months[hot.m]} {data[hot.y].year}
              </span>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
              <span style={{ color: ACCENT }}>{hotCell.total} soru</span>
              {hotCell.referred > 0 && (
                <>
                  <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
                  <span style={{ color: WARN }}>{hotCell.referred} yönlendirildi</span>
                </>
              )}
            </>
          ) : (
            t("calendar.hint")
          )}
        </span>
      </div>

      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: "28px repeat(12, minmax(0,1fr)) 46px" }}
        onPointerLeave={() => setHot(null)}
      >
        <span />
        {initials.map((m, i) => (
          <span
            key={i}
            className="pb-0.5 text-center text-[9px] text-zinc-400 transition-opacity"
            style={{ opacity: hot && hot.m !== i ? 0.4 : 1 }}
          >
            {m}
          </span>
        ))}
        <span className="pb-0.5 text-center text-[9px] text-zinc-400">{t("calendar.year")}</span>

        {data.map((row, y) => (
          <div key={row.year} className="contents">
            <span
              className="flex items-center justify-end pr-1 text-[9.5px] tabular-nums text-zinc-400 transition-opacity"
              style={{ opacity: hot && hot.y !== y ? 0.4 : 1 }}
            >
              {`’${String(row.year).slice(2)}`}
            </span>

            {row.months.map((cell, m) => {
              const on = hot?.y === y && hot?.m === m;
              const dim = !!hot && !on && hot.y !== y && hot.m !== m;
              const referralRate = cell.total ? cell.referred / cell.total : 0;
              const outlineHue = referralRate > 0.4 ? WARN : ACCENT;
              return (
                <motion.button
                  key={m}
                  type="button"
                  aria-label={`${months[m]} ${row.year}: ${cell.total}`}
                  onPointerEnter={() => setHot({ y, m })}
                  onFocus={() => setHot({ y, m })}
                  onBlur={() => setHot(null)}
                  className="grid aspect-square place-items-center rounded-[3px] text-[8px] font-semibold tabular-nums outline-none border border-zinc-100 dark:border-white/[0.04] text-zinc-700 dark:text-zinc-200"
                  style={{
                    background: cellFill(cell, max, on),
                    opacity: dim ? 0.35 : 1,
                    outline: on ? `1.5px solid ${outlineHue}` : "none",
                    outlineOffset: "-1.5px",
                    transition: "opacity 0.2s ease, outline-color 0.2s ease",
                  }}
                  initial={{ scale: reduced ? 1 : 0.6 }}
                  animate={{ scale: 1 }}
                  transition={
                    reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: 0.008 * (y * 12 + m) }
                  }
                >
                  {cell.total >= max * 0.35 && cell.total > 0 ? cell.total : ""}
                </motion.button>
              );
            })}

            <YearTotalCell
              months={row.months}
              total={totals[y]}
              max={max}
              dimmed={!!hot && hot.y !== y}
              reduced={!!reduced}
              align={y === 0 ? "start" : y === data.length - 1 ? "end" : "center"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Yil toplami hucresi — uzerine gelince o yilin kumulatif soru egrisini
 *  solunda acar, boylece sayinin nasil olustugunu gosterir. */
function YearTotalCell({
  months,
  total,
  max,
  dimmed,
  reduced,
  align,
}: {
  months: ActivityCell[];
  total: number;
  max: number;
  dimmed: boolean;
  reduced: boolean;
  align: "start" | "center" | "end";
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const curve = useMemo(() => {
    let acc = 0;
    return months.map((c) => (acc += c.total));
  }, [months]);

  const W = 116;
  const H = 42;
  const hi = Math.max(1, ...curve);
  const px = (i: number) => 3 + (i / Math.max(1, curve.length - 1)) * (W - 6);
  const py = (v: number) => 4 + (1 - v / hi) * (H - 8);
  const pts = curve.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);

  return (
    <div
      className="relative grid cursor-help place-items-center rounded-[3px] text-[9px] font-semibold tabular-nums transition-opacity border border-zinc-100 dark:border-white/[0.04]"
      style={{
        background: cellFill({ total: Math.min(total, max), referred: 0 }, max, open),
        color: ACCENT,
        opacity: dimmed ? 0.4 : 1,
        outline: open ? `1.5px solid ${ACCENT}` : "none",
        outlineOffset: "-1.5px",
      }}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      {total}
      <div
        className={cn(
          "pointer-events-none absolute right-[calc(100%+6px)] z-20",
          align === "start" ? "top-0" : align === "end" ? "bottom-0" : "top-1/2 -translate-y-1/2"
        )}
      >
        <AnimatePresence>
          {open && curve.length > 1 && (
            <motion.div
              className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1a1a1e] p-2 shadow-xl"
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 4, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: 4, scale: 0.96 }}
              transition={{ duration: reduced ? 0 : 0.16, ease: EASE }}
            >
              <div className="mb-1 whitespace-nowrap text-[8.5px] font-medium text-zinc-500">
                {t("calendar.growth")}
              </div>
              <svg width={W} height={H} className="block">
                <path
                  d={`M${pts.join(" L")} L ${px(curve.length - 1)},${py(0)} L ${px(0)},${py(0)} Z`}
                  fill={`color-mix(in srgb, ${ACCENT} 14%, transparent)`}
                />
                <motion.path
                  d={`M${pts.join(" L")}`}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1.4}
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: reduced ? 0 : 0.5, ease: EASE }}
                />
                <circle cx={px(curve.length - 1)} cy={py(curve[curve.length - 1])} r={2.4} fill={ACCENT} />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ActivityCalendar;
