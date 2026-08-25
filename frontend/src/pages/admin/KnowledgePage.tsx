import { useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Repeat2,
  MessageCircleQuestion,
  History,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const cardClass =
  "rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-5 shadow-[0_4px_8px_rgba(0,0,0,0.08)]";

type UnansweredItem = {
  timestamp: string;
  competition: string | null;
  question: string;
  answer: string;
  status: string;
  top_score: number | null;
};

type SssEntry = {
  index: number;
  timestamp: string;
  question: string;
  answer: string;
  competition: string;
  category: string;
  locator: string;
  chunk_id: string;
  author: string | null;
  also_resolves: string[];
};

type FrequentItem = {
  question: string;
  competition: string;
  count: number;
  last_asked: string;
  variants: string[];
};

type UnansweredResponse = {
  unanswered: UnansweredItem[];
  sss_entries: SssEntry[];
  frequent: FrequentItem[];
  quality: { high: number; mid: number; total: number };
  referral: {
    all_time: { total: number; referred: number; rate: number | null };
    last_7d: { total: number; referred: number; rate: number | null };
    prev_7d: { total: number; referred: number; rate: number | null };
  };
  stats: { total_questions: number; answered: number; unanswered: number; resolved: number };
};

type AnswerTarget = {
  question: string;
  competition: string | null;
  variants: string[];
};

export default function KnowledgePage() {
  const { can } = useAuth();
  const canAnswer = can("questions.answer");

  const [data, setData] = useState<UnansweredResponse | null>(null);
  const [competitions, setCompetitions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [target, setTarget] = useState<AnswerTarget | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [answerCompetition, setAnswerCompetition] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet("/api/admin/unanswered"), apiGet("/api/competitions")])
      .then(([u, c]) => {
        if (cancelled) return;
        setData(u);
        setCompetitions(c.competitions || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Veriler yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const frequentByQuestion = useMemo(() => {
    const map = new Map<string, FrequentItem>();
    for (const f of data?.frequent || []) map.set(f.question, f);
    return map;
  }, [data]);

  function openAnswerForm(question: string, competition: string | null) {
    const match = frequentByQuestion.get(question);
    const prefilledCompetition = competition ?? match?.competition ?? null;
    setTarget({ question, competition: prefilledCompetition, variants: match?.variants || [] });
    setAnswerText("");
    setAnswerCompetition(prefilledCompetition || "");
    setSelectedVariants(new Set());
    setSubmitError(null);
  }

  function closeAnswerForm() {
    if (submitting) return;
    setTarget(null);
    setSubmitError(null);
  }

  function toggleVariant(variant: string) {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variant)) next.delete(variant);
      else next.add(variant);
      return next;
    });
  }

  async function submitAnswer() {
    if (!target) return;
    if (!answerText.trim()) {
      setSubmitError("Cevap metni boş olamaz.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const alsoResolves = Array.from(selectedVariants);
      const result = await apiPost("/api/admin/questions/answer", {
        question: target.question,
        answer: answerText.trim(),
        competition: answerCompetition || null,
        also_resolves: alsoResolves,
      });

      const closedQuestions = new Set([target.question, ...alsoResolves]);
      setData((prev) => {
        if (!prev) return prev;
        const remainingUnanswered = prev.unanswered.filter((u) => !closedQuestions.has(u.question));
        const remainingFrequent = prev.frequent.filter((f) => f.question !== target.question);
        const newEntry: SssEntry | undefined = result?.entry;
        return {
          ...prev,
          unanswered: remainingUnanswered,
          frequent: remainingFrequent,
          sss_entries: newEntry ? [newEntry, ...prev.sss_entries] : prev.sss_entries,
          stats: {
            ...prev.stats,
            answered: prev.stats.answered + 1,
            resolved: prev.stats.resolved + closedQuestions.size,
            unanswered: Math.max(0, prev.stats.unanswered - closedQuestions.size),
          },
        };
      });

      setSuccessMessage("Cevap kaydedildi ve bilgi tabanına eklendi.");
      setTarget(null);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Cevap kaydedilemedi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-zinc-500">Yükleniyor...</p>;
  }

  const competitionOptions = Array.from(new Set([...(target?.competition ? [target.competition] : []), ...competitions]));
  const historyEntries = data.sss_entries.slice(0, 30);
  const allVariantsSelected = !!target && target.variants.length > 0 && selectedVariants.size === target.variants.length;

  return (
    <>
      {successMessage && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={16} />
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <GlowCard
          glowColor="orange"
          className="rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-4 flex justify-between shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
        >
          <div>
            <div className="text-2xl font-bold text-amber-600">{data.stats.unanswered}</div>
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mt-1">Bekleyen Soru</div>
            <div className="text-[11px] text-zinc-500">Kanıt yetersizliği nedeniyle insana yönlendirildi</div>
          </div>
          <Inbox size={18} className="text-zinc-400 mt-1" />
        </GlowCard>
        <GlowCard
          glowColor="purple"
          className="rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-4 flex justify-between shadow-[0_4px_8px_rgba(0,0,0,0.08)]"
        >
          <div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-white">{data.frequent.length}</div>
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mt-1">Sık Tekrarlanan Konu</div>
            <div className="text-[11px] text-zinc-500">Anlamca kümelenmiş, tekrar eden yanıtsız sorular</div>
          </div>
          <Repeat2 size={18} className="text-zinc-400 mt-1" />
        </GlowCard>
      </div>

      <GlowCard glowColor="purple" className={cardClass}>
        <h3 className="font-semibold text-zinc-900 dark:text-white">Sık Sorulan (Yanıtsız) Konular</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Aynı anlama gelen ama farklı ifade edilen tekrar eden sorular. Birini yanıtlayarak tüm varyantları birlikte kapatabilirsiniz.
        </p>
        <div className="mt-4 space-y-2">
          {data.frequent.length === 0 && <p className="text-xs text-zinc-400">Tekrar eden yanıtsız konu yok.</p>}
          {data.frequent.map((f) => (
            <div
              key={f.question}
              className="rounded-lg border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{f.question}</div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  {f.count} kez soruldu · {f.competition || "Genel"} · Son: {f.last_asked}
                  {f.variants.length > 0 ? ` · ${f.variants.length} varyant` : ""}
                </div>
              </div>
              {canAnswer && (
                <button
                  onClick={() => openAnswerForm(f.question, f.competition)}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white hover:bg-[#16304d]"
                >
                  Cevapla
                </button>
              )}
            </div>
          ))}
        </div>
      </GlowCard>

      <GlowCard glowColor="orange" className={cardClass}>
        <h3 className="font-semibold text-zinc-900 dark:text-white">Bekleyen Sorular</h3>
        <p className="text-xs text-zinc-500 mt-1">Yapay zekanın kaynaklarda yeterli kanıt bulamadığı, insana yönlendirilen sorular.</p>
        <div className="mt-4 space-y-2">
          {data.unanswered.length === 0 && <p className="text-xs text-zinc-400">Bekleyen soru yok.</p>}
          {data.unanswered.map((u, i) => (
            <div
              key={`${u.timestamp}-${i}`}
              className="rounded-lg bg-[#fff7ed] dark:bg-[#1f1a0f] border border-amber-200 dark:border-[rgba(245,158,11,0.25)] p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{u.question}</div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  {u.timestamp} · {u.competition || "Genel"}
                </div>
              </div>
              {canAnswer && (
                <button
                  onClick={() => openAnswerForm(u.question, u.competition)}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white hover:bg-[#16304d]"
                >
                  Cevapla
                </button>
              )}
            </div>
          ))}
        </div>
      </GlowCard>

      <GlowCard glowColor="green" className={cardClass}>
        <div className="flex items-center gap-2">
          <History size={16} className="text-zinc-400" />
          <h3 className="font-semibold text-zinc-900 dark:text-white">Daha Önce Cevaplanmış (SSS)</h3>
        </div>
        <p className="text-xs text-zinc-500 mt-1">Panelden yanıtlanıp bilgi tabanına eklenmiş kayıtlar (referans amaçlı, son {historyEntries.length} kayıt).</p>
        <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto">
          {historyEntries.length === 0 && <p className="text-xs text-zinc-400">Henüz cevaplanmış kayıt yok.</p>}
          {historyEntries.map((e) => (
            <div key={e.index} className="rounded-lg border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] p-3">
              <div className="flex items-start gap-2">
                <MessageCircleQuestion size={14} className="text-zinc-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-900 dark:text-white">{e.question}</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">{e.answer}</div>
                  <div className="text-[11px] text-zinc-500 mt-1.5">
                    {e.timestamp} · {e.competition || "Genel"}
                    {e.author ? ` · ${e.author}` : ""}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </GlowCard>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <GlowCard glowColor="purple" className="w-full max-w-lg rounded-xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[rgba(255,255,255,0.08)] shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-zinc-900 dark:text-white">Soruyu Yanıtla</h3>
              <button
                onClick={closeAnswerForm}
                disabled={submitting}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs font-medium text-zinc-500">Soru</div>
              <div className="mt-1 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-3 text-sm text-zinc-900 dark:text-white">
                {target.question}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium text-zinc-500">Cevap</label>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 p-3 text-sm outline-none focus:border-[#1e3a5f] dark:focus:border-white/30"
                placeholder="Bilgi tabanına eklenecek cevabı yazın..."
              />
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium text-zinc-500">Yarışma</label>
              <select
                value={answerCompetition}
                onChange={(e) => setAnswerCompetition(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 p-2.5 text-sm outline-none"
              >
                <option value="">Genel</option>
                {competitionOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {target.variants.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-500">Bu varyantları da kapat</label>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedVariants(allVariantsSelected ? new Set() : new Set(target.variants))
                    }
                    className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
                  >
                    {allVariantsSelected ? "Tümünü kaldır" : "Tümünü seç"}
                  </button>
                </div>
                <div className="mt-1 space-y-1.5 max-h-32 overflow-y-auto rounded-lg border border-zinc-200 dark:border-white/10 p-2">
                  {target.variants.map((v) => (
                    <label key={v} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <input type="checkbox" checked={selectedVariants.has(v)} onChange={() => toggleVariant(v)} className="mt-0.5" />
                      <span>{v}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {submitError && (
              <div className="mt-3 flex items-center gap-2 text-xs text-red-500">
                <AlertCircle size={14} />
                {submitError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeAnswerForm}
                disabled={submitting}
                className="text-xs font-medium px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                onClick={submitAnswer}
                disabled={submitting}
                className="text-xs font-medium px-3 py-2 rounded-lg bg-[#1e3a5f] text-white hover:bg-[#16304d] disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Kaydet
              </button>
            </div>
          </GlowCard>
        </div>
      )}
    </>
  );
}
