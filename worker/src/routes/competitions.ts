// GET /api/competitions, GET /api/contexts — Ek A bolum 1, auth yok
// (herkese acik).

import { foldTurkish } from "../lib/rag/turkishFold";
import type { Env } from "../index";

// backend/local_rag_answer.py GENERAL_LABEL ve competitions.py
// GENERAL_FOLDERS ile birebir (tam bu yazımla).
const GENERAL_LABEL = "Genel Kurallar / SSS";
const SPECIAL_VALUES = new Set(["Genel ve Etik kuralar", "SSS"]);

export async function listRealCompetitions(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT DISTINCT competition FROM documents WHERE competition IS NOT NULL ORDER BY competition",
    )
    .all<{ competition: string }>();
  return results.map((r) => r.competition).filter((c) => c && !SPECIAL_VALUES.has(c));
}

export async function handleCompetitions(_request: Request, env: Env): Promise<Response> {
  const competitions = await listRealCompetitions(env.DB);
  return Response.json({ competitions });
}

export async function handleContexts(_request: Request, env: Env): Promise<Response> {
  const competitions = await listRealCompetitions(env.DB);
  return Response.json({ competitions, general_label: GENERAL_LABEL });
}

// competitions.py detect_competition_mention()'ın birebir karşılığı: en
// uzun (en spesifik) eşleşme kazanır ("Su Altı Roket Yarışması" >
// "Roket Yarışması").
//
// GERCEK BUG DUZELTMESI (kullanicinin canli testinde bulundu): duz
// text.toLowerCase() Turkce "İ" harfini yanlis kucultuyordu (bkz.
// turkishFold.ts'deki detayli not), bu yuzden "Dikey İnişli Roket
// Yarışması" gibi İ iceren HER yarisma adi, kullanicinin yazdigi soru
// metniyle (ör. "dikey inişli roket yarışması") ASLA eslesmiyordu —
// sonuc: mention tespit edilemiyor, secili olan (yanlis) yarisma baglaminda
// arama yapiliyor, "elimde bilgi yok" gibi yaniltici bir cevap donuyordu.
// foldTurkish (Turkce-duyarli) kullanilarak duzeltildi.
export async function detectCompetitionMention(
  db: D1Database,
  text: string,
): Promise<string | null> {
  const names = await listRealCompetitions(db);
  const textLow = foldTurkish(text);
  const candidates = [...names].sort((a, b) => b.length - a.length);
  for (const name of candidates) {
    if (textLow.includes(foldTurkish(name))) return name;
  }
  return null;
}
