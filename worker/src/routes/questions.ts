// Yanıtsız sorular / SSS / aktivite endpoint'leri — backend/web_app.py
// api_admin_unanswered/api_admin_activity/api_admin_answer_question ile
// birebir (Ek A bölüm 1).

import { requirePermission, requireAnyPermission, jsonError } from "../lib/auth/middleware";
import {
  readLog,
  unansweredQuestions,
  technicalErrors,
  needsCompetitionQuestions,
  flaggedReports,
  readFeedback,
  recordFeedback,
} from "../lib/qaLog";
import { listEntries, resolvedQuestions, addEntry, SssValidationError } from "../lib/sss";
import {
  qualityBreakdown,
  recentCutoff,
  referralRate,
  activityByMonth,
  frequentUnanswered,
  frequentTopics,
  satisfactionBreakdown,
} from "../lib/insights";
import { listRealCompetitions } from "./competitions";
import type { Env } from "../index";

// hem soruyu yanitlayacak Destek Ekibi'ne (questions.view) hem de sadece
// toplu metrikleri izleyecek Sistem Yoneticisi'ne (insights.view) acik.
const UNANSWERED_PERMISSIONS = ["questions.view", "insights.view"] as const;

export async function handleUnanswered(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAnyPermission(request, env.DB, [...UNANSWERED_PERMISSIONS]);
  if (ctx instanceof Response) return ctx;

  const log = await readLog(env.DB);
  const resolved = await resolvedQuestions(env.DB);
  const unanswered = await unansweredQuestions(env.DB);
  const pending = unanswered.filter((e) => !resolved.has(e.question));
  const entries = await listEntries(env.DB);

  const cut7 = recentCutoff(7);
  const cut14 = recentCutoff(14);
  const referral = {
    all_time: referralRate(log),
    last_7d: referralRate(log, cut7),
    prev_7d: referralRate(log, cut14, cut7),
  };

  const [techErrors, needsComp, flagged, frequent, topics, feedback] = await Promise.all([
    technicalErrors(env.DB),
    needsCompetitionQuestions(env.DB),
    flaggedReports(env.DB),
    frequentUnanswered(env.AI, pending),
    frequentTopics(env.AI, log),
    readFeedback(env.DB),
  ]);

  return Response.json({
    unanswered: [...pending].reverse().slice(0, 200),
    sss_entries: [...entries].reverse().slice(0, 100),
    frequent,
    frequent_topics: topics,
    technical_errors: [...techErrors].reverse().slice(0, 50),
    needs_competition: [...needsComp].reverse().slice(0, 50),
    flagged: [...flagged].reverse().slice(0, 50),
    quality: qualityBreakdown(log),
    // Yarismacinin yanitin altindaki begen/begenme (thumbs up/down) ile
    // DOGRUDAN bildirdigi memnuniyet - "quality" (model guven vekili) ile
    // karistirilmamali.
    satisfaction: satisfactionBreakdown(feedback),
    referral,
    stats: {
      total_questions: log.length,
      answered: log.filter((e) => e.status === "answered").length,
      unanswered: pending.length,
      resolved: entries.length,
    },
  });
}

export async function handleActivity(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAnyPermission(request, env.DB, [...UNANSWERED_PERMISSIONS]);
  if (ctx instanceof Response) return ctx;

  const log = await readLog(env.DB);
  const recent = [...log]
    .reverse()
    .slice(0, 60)
    .map((e) => ({
      timestamp: e.timestamp,
      competition: e.competition,
      question: e.question,
      status: e.status,
      flagged: e.flagged ?? false,
    }));

  return Response.json({ activity: activityByMonth(log), recent });
}

interface FeedbackBody {
  log_id?: number;
  satisfaction?: string;
}

// backend/web_app.py api_feedback()'in birebir karsiligi: /api/ask ile
// ayni erisim modeline sahip (kimlik dogrulama YOK — yarismaci sohbet
// ekranindan dogrudan cagirir).
export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as FeedbackBody | null;
  if (body?.satisfaction !== "up" && body?.satisfaction !== "down") {
    return jsonError("satisfaction 'up' veya 'down' olmalıdır.", 400);
  }
  if (typeof body.log_id !== "number") {
    return jsonError("Geçersiz istek.", 400);
  }
  await recordFeedback(env.DB, body.log_id, body.satisfaction);
  return Response.json({ ok: true });
}

interface AnswerBody {
  question?: string;
  answer?: string;
  competition?: string | null;
  also_resolves?: string[];
}

export async function handleAnswerQuestion(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "questions.answer");
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as AnswerBody | null;
  if (!body?.question || !body.answer) return jsonError("Geçersiz istek.", 400);

  const competition = (body.competition || "").trim() || null;
  if (competition) {
    const realCompetitions = await listRealCompetitions(env.DB);
    if (!realCompetitions.includes(competition)) {
      return jsonError("Geçersiz yarışma seçimi.", 400);
    }
  }

  try {
    const { entry, indexedChunks } = await addEntry(env.DB, env.AI, env.VECTORIZE, {
      question: body.question,
      answer: body.answer,
      competition,
      author: ctx.user.username,
      alsoResolves: body.also_resolves,
    });
    return Response.json({ ok: true, entry, indexed_chunks: indexedChunks });
  } catch (err) {
    if (err instanceof SssValidationError) return jsonError(err.message, 400);
    throw err;
  }
}
