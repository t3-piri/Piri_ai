import { useEffect, useState } from "react";
import { FolderKanban, Activity, Blocks, Inbox } from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { ActivityCalendar, type ActivityYear } from "@/components/ui/activity-calendar";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/context/AuthContext";
import { apiGet, ApiError } from "@/lib/api";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
} from "recharts";

type DocumentsResponse = {
  documents: { document_id: string; competition: string | null; status: string }[];
  stats: { total: number; active: number; inactive: number; chunks: number };
};

type UnansweredResponse = {
  unanswered: { question: string; competition: string | null; timestamp: string }[];
  frequent: { question: string; competition: string; count: number; last_asked: string }[];
  frequent_topics: { question: string; competition: string; count: number; last_asked: string }[];
  quality: { high: number; mid: number; total: number };
  satisfaction: { up: number; down: number; total: number; rate: number | null };
  referral: {
    all_time: { total: number; referred: number; rate: number | null };
    last_7d: { total: number; referred: number; rate: number | null };
  };
  stats: { total_questions: number; answered: number; unanswered: number; resolved: number };
};

function pct(rate: number | null) {
  return rate === null ? "—" : `%${Math.round(rate * 100)}`;
}

// Grafik renk paleti - tutarlı ve premium
const CHART_COLORS = [
  "#6d28d9", // violet-700
  "#2563eb", // blue-600
  "#059669", // emerald-600
  "#d97706", // amber-600
  "#db2777", // pink-600
  "#0891b2", // cyan-600
  "#7c3aed", // violet-600
  "#16a34a", // green-600
];

const questionStatusConfig: ChartConfig = {
  answered: { label: "Yanıtlanan", color: "#059669" },
  unanswered: { label: "Yanıtsız (Bekleyen)", color: "#d97706" },
  resolved: { label: "SSS'e Eklenen", color: "#6d28d9" },
};

const referralConfig: ChartConfig = {
  referred: { label: "Yönlendirilen", color: "#db2777" },
  answered: { label: "Yanıtlanan", color: "#059669" },
};

/** Yarışma bazlı soru dağılımı — Bar Chart */
function CompetitionQuestionsChart({
  data,
  isDark,
}: {
  data: { competition: string; count: number }[];
  isDark: boolean;
}) {
  const config: ChartConfig = Object.fromEntries(
    data.map((d, i) => [d.competition, { label: d.competition, color: CHART_COLORS[i % CHART_COLORS.length] }])
  );

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[180px] text-xs text-zinc-400">
        Henüz yönlendirilen soru verisi yok.
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}
        />
        <XAxis
          dataKey="competition"
          tick={{ fontSize: 10, fill: isDark ? "#71717a" : "#6b7280" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 10) + "…" : v}
        />
        <YAxis
          tick={{ fontSize: 10, fill: isDark ? "#71717a" : "#6b7280" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Yanıt durumu dağılımı — Pie / Donut Chart */
function QuestionStatusPieChart({
  answered,
  unanswered,
  resolved,
}: {
  answered: number;
  unanswered: number;
  resolved: number;
}) {
  const total = answered + unanswered + resolved;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[180px] text-xs text-zinc-400">
        Henüz soru kaydı yok.
      </div>
    );
  }

  const pieData = [
    { name: "answered", value: answered, fill: "#059669" },
    { name: "unanswered", value: unanswered, fill: "#d97706" },
    { name: "resolved", value: resolved, fill: "#6d28d9" },
  ].filter((d) => d.value > 0);

  return (
    <ChartContainer config={questionStatusConfig} className="h-[200px] w-full">
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius="52%"
          outerRadius="75%"
          dataKey="value"
          nameKey="name"
          paddingAngle={2}
          strokeWidth={0}
        >
          {pieData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Pie>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="font-mono font-medium">
                  {value} ({Math.round((Number(value) / total) * 100)}%)
                </span>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
  );
}

/** Son 7 gün vs. önceki 7 gün yönlendirme — Bar Chart */
function ReferralBarChart({
  last7d,
  isDark,
}: {
  last7d: { total: number; referred: number };
  isDark: boolean;
}) {
  const data = [
    {
      period: "Son 7 Gün",
      answered: last7d.total - last7d.referred,
      referred: last7d.referred,
    },
  ];

  if (last7d.total === 0) {
    return (
      <div className="flex items-center justify-center h-[100px] text-xs text-zinc-400">
        Son 7 günde soru kaydı yok.
      </div>
    );
  }

  return (
    <ChartContainer config={referralConfig} className="h-[100px] w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}
          horizontal={false}
        />
        <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="answered" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
        <Bar dataKey="referred" stackId="a" fill="#db2777" radius={[0, 4, 4, 0]} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}

export default function OverviewPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { can } = useAuth();
  // Icerik Yoneticisi kaynak istatistiklerini, Destek Ekibi/Sistem Yoneticisi
  // yanit kalitesi/yonlendirme/sik konular blogunu gorur - sahip ikisini de.
  const canSources = can("sources.view");
  const canInsights = can("questions.view") || can("insights.view");
  const [docs, setDocs] = useState<DocumentsResponse | null>(null);
  const [unanswered, setUnanswered] = useState<UnansweredResponse | null>(null);
  const [activity, setActivity] = useState<ActivityYear[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tasks: Promise<unknown>[] = [];
    if (canSources) {
      tasks.push(
        apiGet("/api/admin/documents").then((d) => {
          if (!cancelled) setDocs(d);
        })
      );
    }
    if (canInsights) {
      tasks.push(
        apiGet("/api/admin/unanswered").then((u) => {
          if (!cancelled) setUnanswered(u);
        })
      );
      // Takvim ozeti ikincil bir sinyal: yuklenemezse sayfanin geri kalani calisir.
      apiGet("/api/admin/activity")
        .then((res) => {
          if (!cancelled) setActivity(res.activity || []);
        })
        .catch(() => undefined);
    }
    Promise.all(tasks).catch((err) => {
      if (cancelled) return;
      setError(err instanceof ApiError ? err.message : "Veriler yüklenemedi.");
    });
    return () => {
      cancelled = true;
    };
  }, [canSources, canInsights]);

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }
  if (!canSources && !canInsights) {
    return <p className="text-sm text-zinc-500">Bu sayfayı görüntüleme yetkiniz yok.</p>;
  }
  if ((canSources && !docs) || (canInsights && !unanswered)) {
    return <p className="text-sm text-zinc-500">Yükleniyor...</p>;
  }

  const cards = [
    ...(docs
      ? [
          { v: String(docs.stats.total), l: "Toplam Kayıt", s: "Kaynak havuzundaki belge", icon: FolderKanban, tone: "text-zinc-900 dark:text-white", glow: "purple" as const },
          { v: String(docs.stats.active), l: "Aktif Sürüm", s: "Aramaya dahil edilen", icon: Activity, tone: "text-emerald-600", glow: "green" as const },
          { v: docs.stats.chunks.toLocaleString("tr-TR"), l: "Vektör Parça", s: "Chroma koleksiyonunda", icon: Blocks, tone: "text-red-500", glow: "red" as const },
        ]
      : []),
    ...(unanswered
      ? [
          {
            v: String(unanswered.stats.unanswered),
            l: "Bekleyen Soru",
            s: `${unanswered.stats.resolved} soru yanıtlanıp işlendi`,
            icon: Inbox,
            tone: "text-amber-600",
            glow: "orange" as const,
          },
        ]
      : []),
  ];

  const topFrequent = unanswered?.frequent[0];
  const topGeneralFrequent = unanswered?.frequent_topics[0];

  // Yarışma bazlı yönlendirilen soru sayısı — `frequent` zaten `unanswered`
  // icindeki ayni kayitlarin kumelenmis hali oldugundan (insights.py:
  // frequent_unanswered(pending)), tek kaynaktan (flat liste) saymak gerekir;
  // ikisini birlikte toplamak her kumelenmis soruyu iki kez sayardi.
  const competitionQuestions = unanswered
    ? (() => {
        const counts = new Map<string, number>();
        for (const u of unanswered.unanswered) {
          const comp = u.competition || "Genel";
          counts.set(comp, (counts.get(comp) || 0) + 1);
        }
        return Array.from(counts.entries())
          .map(([competition, count]) => ({ competition, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);
      })()
    : [];

  // Alttaki iki kart yalnizca tek biri erisilebilirse tam genislik kaplar.
  const bothBottomCards = !!docs && !!unanswered;

  return (
    <>
      {/* Özet Kartları */}
      {cards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {cards.map((c) => (
            <GlowCard
              key={c.l}
              glowColor={c.glow}
              className="rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-4 flex justify-between shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
            >
              <div>
                <div className={`text-2xl font-bold ${c.tone}`}>{c.v}</div>
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mt-1">{c.l}</div>
                <div className="text-[11px] text-zinc-500">{c.s}</div>
              </div>
              <c.icon size={18} className="text-zinc-400 mt-1" />
            </GlowCard>
          ))}
        </div>
      )}

      {/* Grafik Satırı: Yarışma bazlı soru + Soru durumu dağılımı */}
      {unanswered && (
        <div className="grid md:grid-cols-3 gap-5 items-stretch">
          {/* Yarışmaya Göre Yönlendirilen Sorular — BarChart */}
          <GlowCard
            glowColor="purple"
            className="md:col-span-2 rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
          >
            <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Yarışmaya Göre Yönlendirilen Sorular</h3>
            <p className="text-[11px] text-zinc-500 mt-1 mb-4">
              Yanıtsız kalan ve insana yönlendirilen soruların yarışma bazlı dağılımı.
            </p>
            <CompetitionQuestionsChart data={competitionQuestions} isDark={isDark} />
          </GlowCard>

          {/* Soru Durumu Dağılımı — Pie Chart */}
          <GlowCard
            glowColor="green"
            className="rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
          >
            <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Soru Durumu</h3>
            <p className="text-[11px] text-zinc-500 mt-1 mb-2">
              Toplam {unanswered.stats.total_questions} sorunun dağılımı.
            </p>
            <QuestionStatusPieChart
              answered={unanswered.stats.answered}
              unanswered={unanswered.stats.unanswered}
              resolved={unanswered.stats.resolved}
            />
          </GlowCard>
        </div>
      )}

      {/* Etkinlik Takvimi — hangi dönemde ne kadar yoğunluk oldu */}
      {activity.length > 0 && (
        <GlowCard
          glowColor="cyan"
          className="rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
        >
          <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">Etkinlik Takvimi</h3>
          <p className="text-[11px] text-zinc-500 mt-1 mb-4">
            Yıl × ay soru yoğunluğu. Amber tonlar yönlendirme oranının yükseldiği dönemleri işaret eder.
          </p>
          <ActivityCalendar data={activity} />
        </GlowCard>
      )}

      {/* Sistem Performansı */}
      {unanswered && (
        <GlowCard glowColor="blue" className="rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]">
          <h3 className="font-semibold text-zinc-900 dark:text-white">Sistem Performansı</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Yanıt kalitesi, insana yönlendirme oranı ve sık sorulan konuları izleyerek sistemi iyileştirin.
          </p>
          <div className="grid md:grid-cols-3 gap-5 mt-5">
            {[
              {
                k: "YANIT KALİTESİ",
                v: unanswered.quality.total ? `${pct(unanswered.quality.high / unanswered.quality.total)} yüksek güven` : "Henüz veri yok",
                d: `${unanswered.quality.high} yüksek, ${unanswered.quality.mid} orta güvenli yanıt`,
              },
              {
                k: "KULLANICI MEMNUNİYETİ",
                v: unanswered.satisfaction.total ? `${pct(unanswered.satisfaction.rate)} olumlu` : "Henüz geri bildirim yok",
                d: `${unanswered.satisfaction.up} 👍 · ${unanswered.satisfaction.down} 👎 (toplam ${unanswered.satisfaction.total} oy)`,
              },
              {
                k: "İNSANA YÖNLENDİRME ORANI",
                v: pct(unanswered.referral.last_7d.rate),
                d: `Son 7 gün · ${unanswered.referral.last_7d.total} sorudan ${unanswered.referral.last_7d.referred}'i\nTüm zamanlar: ${pct(unanswered.referral.all_time.rate)}`,
              },
              {
                k: "SIK SORULAN (YANITSIZ) KONULAR",
                v: String(unanswered.frequent.length),
                d: topFrequent
                  ? `En sık: "${topFrequent.question}" (${topFrequent.count} kez) — Bilgi Güncelleme'de yanıtlayın.`
                  : "Tekrar eden yanıtsız konu yok.",
              },
              {
                k: "GENEL EN SIK SORULAN KONULAR",
                v: String(unanswered.frequent_topics.length),
                d: topGeneralFrequent
                  ? `En sık: "${topGeneralFrequent.question}" (${topGeneralFrequent.count} kez) — cevaplanmış sorular dahil tüm trafik.`
                  : "Henüz tekrar eden konu yok.",
              },
            ].map((x, i) => (
              <GlowCard
                key={x.k}
                glowColor={(["green", "cyan", "orange", "purple", "blue"] as const)[i]}
                className="rounded-xl bg-white dark:bg-[#1a1a1e] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-4 shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
              >
                <div className="text-[11px] font-semibold tracking-wider text-zinc-500">{x.k}</div>
                <div className="text-lg font-bold text-[#0f2442] dark:text-white mt-1 whitespace-pre-line">{x.v}</div>
                <div className="text-[11px] text-zinc-500 mt-1 whitespace-pre-line">{x.d}</div>
              </GlowCard>
            ))}
          </div>

          {/* Son 7 Gün Yönlendirme Grafiği */}
          <div className="mt-5">
            <p className="text-[11px] font-semibold tracking-wider text-zinc-500 mb-3">SON 7 GÜN YÖNLENDİRME DAĞILIMI</p>
            <ReferralBarChart last7d={unanswered.referral.last_7d} isDark={isDark} />
          </div>
        </GlowCard>
      )}

      {/* Bekleyen Sorular */}
      {(docs || unanswered) && (
        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {docs && (
            <GlowCard
              glowColor="purple"
              className={`${bothBottomCards ? "md:col-span-2" : "md:col-span-3"} rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)] flex flex-col h-full max-h-[300px] overflow-hidden`}
            >
              <h3 className="font-semibold text-zinc-900 dark:text-white">En Çok Kaynak Yarışmaları</h3>
              <p className="text-xs text-zinc-500">En çok doğrulanmış belgeye sahip ilk 4 yarışma.</p>
              <div className="mt-4 space-y-3">
                {(() => {
                  const counts = new Map<string, number>();
                  for (const d of docs.documents) {
                    if (d.status !== "active" || !d.competition) continue;
                    counts.set(d.competition, (counts.get(d.competition) || 0) + 1);
                  }
                  const top = Array.from(counts.entries())
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 4);
                  const maxCount = top[0]?.count || 1;
                  return top.length === 0 ? (
                    <p className="text-xs text-zinc-400">Henüz aktif kaynak yok.</p>
                  ) : (
                    top.map((r) => (
                      <div key={r.name} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="truncate pr-2">{r.name}</span>
                            <span className="font-medium">{r.count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))
                  );
                })()}
              </div>
            </GlowCard>
          )}
          {unanswered && (
            <GlowCard
              glowColor="orange"
              className={`${bothBottomCards ? "" : "md:col-span-3"} rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)] flex flex-col h-full max-h-[300px]`}
            >
              <h3 className="font-semibold text-zinc-900 dark:text-white">Son Bekleyen Sorular</h3>
              <p className="text-xs text-zinc-500">Kaynaklarda yeterli kanıt bulunamayan sorular.</p>
              <div className="mt-3 space-y-2 overflow-y-auto">
                {unanswered.unanswered.slice(0, 2).length === 0 && <p className="text-xs text-zinc-400">Bekleyen soru yok.</p>}
                {unanswered.unanswered.slice(0, 2).map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-[#fff7ed] dark:bg-[#1f1a0f] border border-amber-200 dark:border-[rgba(245,158,11,0.25)] p-3 shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
                  >
                    <div className="text-sm font-medium text-zinc-900 dark:text-white">{s.question}</div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      {s.timestamp} {s.competition ? `· ${s.competition}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </GlowCard>
          )}
        </div>
      )}
    </>
  );
}
