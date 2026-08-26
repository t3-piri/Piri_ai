// backend/sss_store.py'nin D1 karsiligi. Panelden cevaplanan bir soru
// kalici kayda yazilir VE ANINDA D1 document_chunks + Vectorize'a islenir
// (soru tekrar sorulursa kaynakli yanit verilebilsin diye).

import { embedDocuments } from "./ai/embeddingProvider";
import { foldTurkish } from "./rag/turkishFold";
import { ensureRegistered } from "./documents/registry";

const SSS_FOLDER = "SSS";
const VIRTUAL_FILE = "Destek Ekibi Yanıtları (Panel SSS)";

export interface SssEntry {
  idx: number;
  timestamp: string;
  question: string;
  answer: string;
  competition: string | null;
  category: string;
  locator: string;
  chunk_id: string;
  author: string | null;
  also_resolves: string[];
}

interface SssEntryRow {
  idx: number;
  timestamp: string;
  question: string;
  answer: string;
  competition: string | null;
  category: string;
  locator: string;
  chunk_id: string;
  author: string | null;
  also_resolves: string;
}

function rowToEntry(row: SssEntryRow): SssEntry {
  return { ...row, also_resolves: JSON.parse(row.also_resolves || "[]") };
}

export async function listEntries(db: D1Database): Promise<SssEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM sss_entries ORDER BY idx ASC")
    .all<SssEntryRow>();
  return results.map(rowToEntry);
}

// resolved_questions()'in birebir karsiligi: panelden cevaplanmis (veya
// bir kumenin varyanti olarak isaretlenmis) sorularin metin kumesi.
export async function resolvedQuestions(db: D1Database): Promise<Set<string>> {
  const entries = await listEntries(db);
  const resolved = new Set<string>();
  for (const e of entries) {
    if (e.question) resolved.add(e.question);
    for (const v of e.also_resolves) resolved.add(v);
  }
  return resolved;
}

function scope(competition: string | null): { competition: string; category: "sss" | "yarisma" } {
  if (!competition || competition === SSS_FOLDER) {
    return { competition: SSS_FOLDER, category: "sss" };
  }
  return { competition, category: "yarisma" };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class SssValidationError extends Error {}

// add_entry()'nin birebir karsiligi. Donus: {entry, indexed_chunks}.
export async function addEntry(
  db: D1Database,
  ai: Ai,
  vectorize: VectorizeIndex,
  params: {
    question: string;
    answer: string;
    competition: string | null;
    author: string | null;
    alsoResolves?: string[];
  },
): Promise<{ entry: SssEntry; indexedChunks: number }> {
  const question = (params.question || "").trim();
  const answer = (params.answer || "").trim();
  if (!question) throw new SssValidationError("Soru boş olamaz.");
  if (!answer) throw new SssValidationError("Cevap boş olamaz.");
  const alsoResolves = (params.alsoResolves ?? [])
    .map((v) => (v || "").trim())
    .filter((v) => v && v !== question);

  const { competition: scopeCompetition, category } = scope(params.competition);
  const countRow = await db.prepare("SELECT COUNT(*) as n FROM sss_entries").first<{ n: number }>();
  const index = (countRow?.n ?? 0) + 1;
  const locator = `SSS kaydı #${index}`;

  const documentId = `${scopeCompetition}::${VIRTUAL_FILE}`;
  await ensureRegistered(db, {
    documentId,
    fileName: VIRTUAL_FILE,
    competition: scopeCompetition,
    category,
  });

  const text = `Soru: ${question}\nCevap: ${answer}`;
  const chunkId = await sha256Hex(`${scopeCompetition}/${VIRTUAL_FILE}|${locator}|${index}|v1`);
  const foldedText = foldTurkish(text);

  const [vector] = await embedDocuments(ai, [text]);
  await db
    .prepare(
      `INSERT INTO document_chunks
         (id, document_id, version, competition, category, file_name, file_type, locator, content, content_folded, status)
       VALUES (?, ?, 1, ?, ?, ?, 'sss', ?, ?, ?, 'active')`,
    )
    .bind(
      chunkId,
      `${scopeCompetition}::${VIRTUAL_FILE}`,
      scopeCompetition,
      category,
      VIRTUAL_FILE,
      locator,
      text,
      foldedText,
    )
    .run();
  await vectorize.upsert([
    {
      id: chunkId,
      values: vector,
      metadata: {
        documentId: `${scopeCompetition}::${VIRTUAL_FILE}`,
        competition: scopeCompetition,
        category,
        status: "active",
        version: 1,
      },
    },
  ]);

  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  await db
    .prepare(
      `INSERT INTO sss_entries
         (idx, timestamp, question, answer, competition, category, locator, chunk_id, author, also_resolves)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      index,
      timestamp,
      question,
      answer,
      scopeCompetition,
      category,
      locator,
      chunkId,
      params.author,
      JSON.stringify(alsoResolves),
    )
    .run();

  return {
    entry: {
      idx: index,
      timestamp,
      question,
      answer,
      competition: scopeCompetition,
      category,
      locator,
      chunk_id: chunkId,
      author: params.author,
      also_resolves: alsoResolves,
    },
    indexedChunks: 1,
  };
}
