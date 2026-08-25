import { useEffect, useMemo, useState } from "react";
import { CalendarRange, TrendingUp, MessageSquare, AlertTriangle, Flag } from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { ActivityCalendar, type ActivityYear } from "@/components/ui/activity-calendar";
import { apiGet, ApiError } from "@/lib/api";

type RecentTurn = {
  timestamp: string;
  competition: string | null;
  question: string;
  status: string;
  flagged: boolean;
};

type ActivityResponse = {
  activity: ActivityYear[];
  recent: RecentTurn[];
};

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  answered: { text: "Yanıtlandı", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  low_confidence: { text: "Yönlendirildi", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  technical_error: { text: "Teknik hata", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  needs_competition: { text: "Yarışma Belirsiz", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  unclear: { text: "Anlaşılamadı", className: "bg-zinc-500/10 text-zinc-500" },
};

const cardClass =
  "rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]";

export default function ActivityPage() {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet("/api/admin/activity")
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Etkinlik verisi yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    if (!data) return null;
    let total = 0;
    let referred = 0;
    let busiest = { label: "—", count: 0 };
    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    for (const row of data.activity) {
      row.months.forEach((cell, i) => {
        total += cell.total;
        referred += cell.referred;
        if (cell.total > busiest.count) busiest = { label: `${monthNames[i]} ${row.year}`, count: cell.total };
      });
    }
    return { total, referred, busiest };
  }, [data]);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!data || !summary) return <p className="text-sm text-zinc-500">Yükleniyor...</p>;

  const cards = [
    { v: String(summary.total), l: "Toplam Soru", s: "Kayıtlı tüm etkileşim", icon: MessageSquare, tone: "text-zinc-900 dark:text-white", glow: "purple" as const },
    { v: String(summary.referred), l: "Yönlendirilen", s: "Kanıt yetersizliğiyle insana devredildi", icon: AlertTriangle, tone: "text-amber-600", glow: "orange" as const },
    { v: summary.busiest.label, l: "En Yoğun Dönem", s: `${summary.busiest.count} soru`, icon: TrendingUp, tone: "text-violet-600 dark:text-violet-400 text-lg", glow: "blue" as const },
  ];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cards.map((c) => (
          <GlowCard key={c.l} glowColor={c.glow} className={`${cardClass} flex justify-between p-4`}>
            <div className="min-w-0">
              <div className={`text-2xl font-bold truncate ${c.tone}`}>{c.v}</div>
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mt-1">{c.l}</div>
              <div className="text-[11px] text-zinc-500 truncate">{c.s}</div>
            </div>
            <c.icon size={18} className="text-zinc-400 mt-1 shrink-0" />
          </GlowCard>
        ))}
      </div>

      <GlowCard glowColor="purple" className={cardClass}>
        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm flex items-center gap-2">
          <CalendarRange size={15} className="text-violet-500" />
          Etkinlik Takvimi
        </h3>
        <p className="text-[11px] text-zinc-500 mt-1 mb-4">
          Yıl × ay yoğunluk ızgarası. Mor tonlar sağlıklı hacmi, amber tonlar yönlendirme oranı yüksek dönemleri
          gösterir. Yıl sütununun üzerine gelerek o yılın kümülatif eğrisini görebilirsiniz.
        </p>
        <ActivityCalendar data={data.activity} />
      </GlowCard>

      <GlowCard glowColor="cyan" className={cardClass}>
        <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Son Hareketler</h3>
        <p className="text-[11px] text-zinc-500 mt-1 mb-4">Sisteme gelen son sorular ve nasıl sonuçlandıkları.</p>
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {data.recent.length === 0 && <p className="text-xs text-zinc-400">Henüz kayıt yok.</p>}
          {data.recent.map((r, i) => {
            const badge = STATUS_LABEL[r.status] ?? {
              text: r.status,
              className: "bg-zinc-500/10 text-zinc-500",
            };
            return (
              <div
                key={`${r.timestamp}-${i}`}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  r.flagged
                    ? "border-rose-200 dark:border-rose-500/20 bg-rose-50/40 dark:bg-rose-500/5"
                    : "border-zinc-100 dark:border-white/[0.06]"
                }`}
              >
                {r.flagged && (
                  <span title="Kullanıcı sorun bildirdi" className="shrink-0 text-rose-500">
                    <Flag size={12} />
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.className}`}>
                  {badge.text}
                </span>
                <span className="text-xs text-zinc-800 dark:text-zinc-200 truncate flex-1">{r.question}</span>
                <span className="text-[10px] text-zinc-400 shrink-0 hidden sm:block">
                  {r.competition || "Genel"} · {r.timestamp}
                </span>
              </div>
            );
          })}
        </div>
      </GlowCard>
    </>
  );
}
