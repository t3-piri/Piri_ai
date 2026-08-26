// backend/insights.py'nin D1 karsiligi. qa_log tablosu artik dosya yerine
// D1'de oldugu icin bazi hesaplamalar (referral_rate, activity_by_month)
// SQL ile yapilabilir; frequent_unanswered (embedding tabanli kumeleme)
// orijinaldeki gibi bellekte, ama RAG'de zaten kullanilan embedding
// modeliyle (embedQuery) yapiliyor.

import { embedQuery } from "./ai/embeddingProvider";
import { CONFIDENCE_HIGH } from "../config/rag";
import type { QaLogEntry, FeedbackEntry } from "./qaLog";

export function qualityBreakdown(log: QaLogEntry[]): { high: number; mid: number; total: number } {
  const answered = log.filter((e) => e.status === "answered" && e.top_score !== null);
  const high = answered.filter((e) => (e.top_score as number) > CONFIDENCE_HIGH).length;
  return { high, mid: answered.length - high, total: answered.length };
}

// backend/insights.py satisfaction_breakdown()'un birebir karsiligi:
// yarismacinin yanitin altindaki begen/begenme (thumbs up/down) ile
// DOGRUDAN bildirdigi memnuniyet - quality_breakdown'daki model-guven
// vekilinden farkli olarak kullanicinin kendi degerlendirmesidir.
export function satisfactionBreakdown(
  feedback: FeedbackEntry[],
): { up: number; down: number; total: number; rate: number | null } {
  const up = feedback.filter((f) => f.satisfaction === "up").length;
  const down = feedback.filter((f) => f.satisfaction === "down").length;
  const total = up + down;
  return { up, down, total, rate: total ? Math.round((up / total) * 10000) / 10000 : null };
}

export function recentCutoff(days: number): string {
  const d = new Date(Date.now() - days * 86400 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function referralRate(
  log: QaLogEntry[],
  since?: string,
  until?: string,
): { total: number; referred: number; rate: number | null } {
  const subset = log.filter(
    (e) => (since === undefined || e.timestamp >= since) && (until === undefined || e.timestamp < until),
  );
  const total = subset.length;
  const referred = subset.filter((e) => e.status === "low_confidence").length;
  return { total, referred, rate: total ? Math.round((referred / total) * 10000) / 10000 : null };
}

export function activityByMonth(
  log: QaLogEntry[],
  yearsBack = 4,
): Array<{ year: number; months: Array<{ total: number; referred: number }> }> {
  const currentYear = new Date().getFullYear();
  const firstYear = currentYear - yearsBack + 1;

  const grid = new Map<number, Array<{ total: number; referred: number }>>();
  for (let y = firstYear; y <= currentYear; y++) {
    grid.set(
      y,
      Array.from({ length: 12 }, () => ({ total: 0, referred: 0 })),
    );
  }

  for (const entry of log) {
    const stamp = entry.timestamp || "";
    if (stamp.length < 7) continue;
    const year = parseInt(stamp.slice(0, 4), 10);
    const month = parseInt(stamp.slice(5, 7), 10);
    if (!grid.has(year) || month < 1 || month > 12) continue;
    const cell = grid.get(year)![month - 1];
    cell.total += 1;
    if (entry.status === "low_confidence") cell.referred += 1;
  }

  return [...grid.keys()].sort().map((year) => ({ year, months: grid.get(year)! }));
}

const FREQUENT_MIN_COUNT = 2;
const FREQUENT_SIMILARITY = 0.86;
const FREQUENT_TOP_N = 20;

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function cosineClusters(vectors: number[][], threshold: number): number[][] {
  const n = vectors.length;
  const assigned = new Array(n).fill(false);
  const clusters: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (assigned[i]) continue;
    const members = [i];
    assigned[i] = true;
    for (let j = i + 1; j < n; j++) {
      if (!assigned[j] && dot(vectors[i], vectors[j]) >= threshold) {
        members.push(j);
        assigned[j] = true;
      }
    }
    clusters.push(members);
  }
  return clusters;
}

export interface FrequentGroup {
  question: string;
  competition: string;
  count: number;
  last_asked: string;
  variants: string[];
}

// backend/insights.py _frequent_clusters()'in birebir karsiligi — hem
// frequent_unanswered (sadece insana yonlenenler) hem frequent_topics
// (basariyla cevaplananlar dahil TUM trafik) tarafindan paylasilir. Her
// yarisma/baglam kendi icinde kumelenir, cunku ayni ifadeyle sorulan bir
// soru farkli yarismalar icin farkli cevap gerektirebilir.
async function frequentClusters(
  ai: Ai,
  entries: QaLogEntry[],
  minCount: number,
  threshold: number,
  topN: number,
): Promise<FrequentGroup[]> {
  const byScope = new Map<string, QaLogEntry[]>();
  for (const e of entries) {
    const key = e.competition || "Genel";
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key)!.push(e);
  }

  const results: FrequentGroup[] = [];
  for (const [scope, items] of byScope) {
    if (items.length < minCount) continue;
    // embed_passages'in aksine embedQuery tek metin alir — burada da RAG'in
    // ayni embedding modeli kullanildigi icin (paralel) tek tek cagriliyor.
    const vectors = await Promise.all(items.map((it) => embedQuery(ai, it.question)));
    for (const members of cosineClusters(vectors, threshold)) {
      if (members.length < minCount) continue;
      const group = members
        .map((i) => items[i])
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      const representative = group[0].question;
      const variants = group
        .slice(1)
        .map((g) => g.question)
        .filter((q) => q !== representative);
      results.push({
        question: representative,
        competition: scope,
        count: group.length,
        last_asked: group[0].timestamp,
        variants: [...new Set(variants)].slice(0, 6),
      });
    }
  }

  results.sort((a, b) => (b.count !== a.count ? b.count - a.count : (b.last_asked > a.last_asked ? 1 : -1)));
  return results.slice(0, topN);
}

// frequent_unanswered()'in birebir karsiligi. entries: henuz SSS ile
// cevaplanmamis, 'low_confidence' qa_log kayitlari - AI'in basariyla
// cevapladigi sorular DAHIL EDILMEZ.
export function frequentUnanswered(
  ai: Ai,
  entries: QaLogEntry[],
  minCount = FREQUENT_MIN_COUNT,
  threshold = FREQUENT_SIMILARITY,
  topN = FREQUENT_TOP_N,
): Promise<FrequentGroup[]> {
  return frequentClusters(ai, entries, minCount, threshold, topN);
}

// backend/insights.py frequent_topics()'in birebir karsiligi:
// frequent_unanswered'in aksine SADECE insana yonlenen degil, basariyla
// cevaplanan sorular DAHIL TUM soru trafigi uzerinden kumeler - sorumlunun
// yarismacilarin GENEL OLARAK en cok hangi konularda soru sordugunu
// gormesi icindir. 'unclear' (anlamsiz/klavye karalamasi) kayitlar gercek
// bir soru olmadigindan disarida birakilir.
export function frequentTopics(
  ai: Ai,
  log: QaLogEntry[],
  minCount = FREQUENT_MIN_COUNT,
  threshold = FREQUENT_SIMILARITY,
  topN = FREQUENT_TOP_N,
): Promise<FrequentGroup[]> {
  const entries = log.filter((e) => e.status !== "unclear");
  return frequentClusters(ai, entries, minCount, threshold, topN);
}
