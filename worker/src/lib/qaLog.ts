// backend/qa_log.py'nin D1 karsiligi (qa_log.jsonl yerine qa_log tablosu).

export interface QaLogEntry {
  id: number;
  timestamp: string;
  competition: string | null;
  question: string;
  answer: string | null;
  status: string;
  top_score: number | null;
  flagged: boolean;
}

// backend/qa_log.py'deki log_turn() artik bir log_id donduruyor (yarismaci
// bir yanitin altinda begen/begenme bildirdiginde hangi kayitla eslestirmek
// icin) - Python'da ayrica uretilen bir uuid, ama D1'de qa_log tablosunun
// dogal auto-increment id'si zaten bu amaca birebir hizmet ediyor, ayri bir
// alan eklemeye gerek yok.
export async function logTurn(
  db: D1Database,
  params: {
    competition: string | null;
    question: string;
    answer: string;
    status: string;
    topScore: number | null;
    flagged: boolean;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO qa_log (timestamp, competition, question, answer, status, top_score, flagged)
       VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.competition,
      params.question,
      params.answer,
      params.status,
      params.topScore,
      params.flagged ? 1 : 0,
    )
    .run();
  return result.meta.last_row_id;
}

export interface FeedbackEntry {
  log_id: number;
  satisfaction: "up" | "down";
}

// backend/qa_log.py record_feedback()/read_feedback()'in D1 karsiligi.
export async function recordFeedback(
  db: D1Database,
  logId: number,
  satisfaction: "up" | "down",
): Promise<void> {
  await db
    .prepare(`INSERT INTO qa_feedback (log_id, satisfaction, created_at) VALUES (?, ?, datetime('now'))`)
    .bind(logId, satisfaction)
    .run();
}

export async function readFeedback(db: D1Database): Promise<FeedbackEntry[]> {
  const { results } = await db.prepare("SELECT log_id, satisfaction FROM qa_feedback").all<FeedbackEntry>();
  return results;
}

async function queryByStatus(db: D1Database, status: string): Promise<QaLogEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM qa_log WHERE status = ? ORDER BY id DESC")
    .bind(status)
    .all<QaLogEntry>();
  return results.map((r) => ({ ...r, flagged: !!r.flagged }));
}

// unresolved_entries()/unanswered_questions() ile ayni (ikisi de
// 'low_confidence').
export function unansweredQuestions(db: D1Database): Promise<QaLogEntry[]> {
  return queryByStatus(db, "low_confidence");
}

export function technicalErrors(db: D1Database): Promise<QaLogEntry[]> {
  return queryByStatus(db, "technical_error");
}

export function needsCompetitionQuestions(db: D1Database): Promise<QaLogEntry[]> {
  return queryByStatus(db, "needs_competition");
}

export async function flaggedReports(db: D1Database): Promise<QaLogEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM qa_log WHERE flagged = 1 ORDER BY id DESC")
    .all<QaLogEntry>();
  return results.map((r) => ({ ...r, flagged: !!r.flagged }));
}

export async function readLog(db: D1Database, limit = 5000): Promise<QaLogEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM qa_log ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all<QaLogEntry>();
  return results.map((r) => ({ ...r, flagged: !!r.flagged }));
}
