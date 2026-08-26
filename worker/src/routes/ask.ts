// POST /api/ask — Ek A/B'deki sözleşmeyle birebir (backend/web_app.py
// api_ask/_answer_body/_clean_sources).

import { answerAuto } from "../lib/rag/answerEngine";
import { listRealCompetitions } from "./competitions";
import { GENERAL_LABEL } from "../config/rag";
import { jsonError } from "../lib/auth/middleware";
import type { SearchHit } from "../lib/rag/search";
import { condenseQuestion, type HistoryTurn } from "../lib/rag/condense";
import type { Env } from "../index";

interface AskBody {
  question?: string;
  context?: string | null;
  competition?: string | null; // geriye donuk uyumluluk
  history?: HistoryTurn[];
}

function sanitizeHistory(history: unknown): HistoryTurn[] {
  if (!Array.isArray(history)) return [];
  return history.filter(
    (h): h is HistoryTurn =>
      !!h &&
      typeof h === "object" &&
      (h.role === "user" || h.role === "assistant") &&
      typeof h.text === "string" &&
      h.text.trim().length > 0,
  );
}

// _answer_body()'nin birebir karsiligi: answer_question() yanitin sonuna
// kaynak blogu + guven satiri ekliyor; web'de bunlar yapisal (chip/rozet)
// gosterildigi icin govde ayriliyor.
function answerBody(answerText: string): string {
  const marker = "\n\nKaynak: [";
  const idx = answerText.indexOf(marker);
  return (idx !== -1 ? answerText.slice(0, idx) : answerText).trim();
}

// _clean_sources()'in birebir karsiligi.
function cleanSources(hits: SearchHit[] | undefined, limit = 6) {
  const seen = new Set<string>();
  const out: Array<{ file: string; locator: string; competition: string; score: number }> = [];
  for (const h of hits ?? []) {
    const key = h.metadata.file;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      file: h.metadata.file || "",
      locator: h.metadata.locator || "",
      competition: h.metadata.competition || "",
      score: Math.round(h.score * 10000) / 10000,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function handleAsk(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as AskBody | null;
  const question = (body?.question ?? "").trim();
  if (!question) {
    return jsonError("Soru boş olamaz.", 400);
  }

  const context = (body?.context ?? body?.competition ?? "").trim() || null;
  if (context && context !== GENERAL_LABEL) {
    const realCompetitions = await listRealCompetitions(env.DB);
    if (!realCompetitions.includes(context)) {
      return jsonError("Geçersiz yarışma seçimi.", 400);
    }
  }

  const history = sanitizeHistory(body?.history);
  const effectiveQuestion = await condenseQuestion(env.AI, question, history);

  const result = await answerAuto(env, effectiveQuestion, context);
  const status = result.status;

  return Response.json({
    answer: answerBody(result.answer),
    status,
    confidence: result.confidence,
    top_score: result.top_score,
    sources: status === "answered" ? cleanSources(result.sources) : [],
    current_competition: result.current_competition ?? null,
    context,
    competition_options: status === "needs_competition" ? await listRealCompetitions(env.DB) : [],
    // Yarismacinin bu yanitin altinda begen/begenme (thumbs up/down)
    // bildirirken /api/feedback'e gonderecegi kimlik (bkz. qaLog.ts).
    log_id: result.log_id ?? null,
  });
}
