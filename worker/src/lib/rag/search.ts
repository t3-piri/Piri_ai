// backend/local_rag_answer.py _hybrid_search()'un birebir davranissal
// karsiligi: yogun (Vectorize) + lexical (D1 FTS5 BM25) aramayi
// Reciprocal Rank Fusion ile birlestirir, "rescue" adimiyla RRF'nin
// yazim-hatali sorgularda dogru parcayi disarida birakma riskini azaltir.

import { embedQuery } from "../ai/embeddingProvider";
import { foldTurkish } from "./turkishFold";
import { withTimeout } from "../withTimeout";
import { GENERAL_CATEGORIES, RRF_K, CONFIDENCE_HIGH } from "../../config/rag";

const VECTORIZE_TIMEOUT_MS = 15_000;

export interface SearchHit {
  id: string;
  text: string;
  metadata: {
    file: string;
    locator: string | null;
    competition: string | null;
    category: string;
  };
  score: number;
}

interface ChunkRow {
  id: string;
  content: string;
  competition: string | null;
  category: string;
  file_name: string;
  locator: string | null;
}

interface ScopeFilter {
  competition?: string;
  categoryIn?: readonly string[];
}

async function denseSearch(
  vectorize: VectorizeIndex,
  ai: Ai,
  question: string,
  scope: ScopeFilter,
  fetchK: number,
): Promise<{ rank: Map<string, number>; rawScore: Map<string, number> }> {
  const vector = await embedQuery(ai, question);
  const filter: VectorizeVectorMetadataFilter = { status: "active" };
  if (scope.competition) filter.competition = scope.competition;
  if (scope.categoryIn) filter.category = { $in: [...scope.categoryIn] };

  const result = await withTimeout(
    vectorize.query(vector, { topK: fetchK, filter, returnMetadata: "none" }),
    VECTORIZE_TIMEOUT_MS,
    "Vectorize sorgusu",
  );

  const rank = new Map<string, number>();
  const rawScore = new Map<string, number>();
  result.matches.forEach((m, idx) => {
    rank.set(m.id, idx + 1);
    rawScore.set(m.id, m.score);
  });
  return { rank, rawScore };
}

function ftsQueryFor(question: string): string {
  const tokens = foldTurkish(question).match(/[a-z0-9]+/g) ?? [];
  if (tokens.length === 0) return "";
  // FTS5 MATCH: terimleri OR ile birlestir (BM25Okapi.get_scores tum
  // korpusu skorlayip en iyileri secmenin karsiligi — herhangi bir terimi
  // iceren aday havuzu genis tutulur, siralama bm25() fonksiyonuna kalir).
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}

async function bm25Search(
  db: D1Database,
  question: string,
  scope: ScopeFilter,
  fetchK: number,
): Promise<{ rank: Map<string, number>; rows: Map<string, ChunkRow> }> {
  const matchQuery = ftsQueryFor(question);
  const rank = new Map<string, number>();
  const rows = new Map<string, ChunkRow>();
  if (!matchQuery) return { rank, rows };

  const conditions = ["c.status = 'active'"];
  const params: unknown[] = [];
  if (scope.competition) {
    conditions.push("c.competition = ?");
    params.push(scope.competition);
  }
  if (scope.categoryIn) {
    conditions.push(`c.category IN (${scope.categoryIn.map(() => "?").join(",")})`);
    params.push(...scope.categoryIn);
  }

  const sql = `
    SELECT c.id, c.content, c.competition, c.category, c.file_name, c.locator,
           bm25(document_chunks_fts) as rank_score
    FROM document_chunks_fts
    JOIN document_chunks c ON c.rowid = document_chunks_fts.rowid
    WHERE document_chunks_fts MATCH ? AND ${conditions.join(" AND ")}
    ORDER BY rank_score ASC
    LIMIT ?`;

  const { results } = await db
    .prepare(sql)
    .bind(matchQuery, ...params, fetchK)
    .all<ChunkRow & { rank_score: number }>();

  results.forEach((row, idx) => {
    rank.set(row.id, idx + 1);
    rows.set(row.id, row);
  });
  return { rank, rows };
}

async function fetchChunkRows(db: D1Database, ids: string[]): Promise<Map<string, ChunkRow>> {
  const rows = new Map<string, ChunkRow>();
  if (ids.length === 0) return rows;
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT id, content, competition, category, file_name, locator FROM document_chunks WHERE id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<ChunkRow>();
  for (const row of results) rows.set(row.id, row);
  return rows;
}

export async function hybridSearch(
  db: D1Database,
  vectorize: VectorizeIndex,
  ai: Ai,
  question: string,
  scope: ScopeFilter,
  topK = 14,
  fetchK = 45,
): Promise<{ hits: SearchHit[]; maxDenseScore: number }> {
  const [{ rank: denseRank, rawScore: denseScore }, { rank: bm25Rank, rows: bm25Rows }] =
    await Promise.all([
      denseSearch(vectorize, ai, question, scope, fetchK),
      bm25Search(db, question, scope, fetchK),
    ]);

  const denseOnlyIds = [...denseRank.keys()].filter((id) => !bm25Rows.has(id));
  const denseRows = await fetchChunkRows(db, denseOnlyIds);
  const infoById = new Map<string, ChunkRow>([...bm25Rows, ...denseRows]);

  const allIds = new Set([...denseRank.keys(), ...bm25Rank.keys()]);
  const fused: Array<{ id: string; score: number }> = [];
  for (const id of allIds) {
    let score = 0;
    if (denseRank.has(id)) score += 1 / (RRF_K + denseRank.get(id)!);
    if (bm25Rank.has(id)) score += 1 / (RRF_K + bm25Rank.get(id)!);
    fused.push({ id, score });
  }
  fused.sort((a, b) => b.score - a.score);

  const hits: SearchHit[] = [];
  const seenText = new Set<string>();
  const toHit = (id: string, score: number): SearchHit | null => {
    const row = infoById.get(id);
    if (!row) return null;
    return {
      id: row.id,
      text: row.content,
      metadata: {
        file: row.file_name,
        locator: row.locator,
        competition: row.competition,
        category: row.category,
      },
      score,
    };
  };

  for (const { id, score } of fused) {
    const row = infoById.get(id);
    if (!row) continue;
    const key = row.content.trim().slice(0, 300);
    if (seenText.has(key)) continue;
    seenText.add(key);
    const rawDense = denseScore.get(id);
    const hit = toHit(id, rawDense ?? score);
    if (hit) hits.push(hit);
    if (hits.length >= topK) break;
  }

  // "Rescue" adimi: havuzda CONFIDENCE_HIGH ustu ham cosine skorlu ama
  // secilmemis bir aday varsa, secilen kumedeki en zayif skorluyla
  // degistirilir (orijinaldeki yazim-hatasi saglamlastirmasi).
  const denseSorted = [...denseScore.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, dscore] of denseSorted) {
    if (dscore < CONFIDENCE_HIGH || hits.length === 0) break;
    const row = infoById.get(id) ?? (await fetchChunkRows(db, [id])).get(id);
    if (!row) continue;
    const key = row.content.trim().slice(0, 300);
    if (seenText.has(key)) continue;
    let weakestIdx = 0;
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].score < hits[weakestIdx].score) weakestIdx = i;
    }
    if (hits[weakestIdx].score >= dscore) continue;
    seenText.delete(hits[weakestIdx].text.trim().slice(0, 300));
    seenText.add(key);
    hits[weakestIdx] = {
      id: row.id,
      text: row.content,
      metadata: {
        file: row.file_name,
        locator: row.locator,
        competition: row.competition,
        category: row.category,
      },
      score: dscore,
    };
  }

  const maxDenseScore = denseSorted.length > 0 ? denseSorted[0][1] : 0;
  return { hits, maxDenseScore };
}

export function searchGeneral(
  db: D1Database,
  vectorize: VectorizeIndex,
  ai: Ai,
  question: string,
) {
  return hybridSearch(db, vectorize, ai, question, { categoryIn: GENERAL_CATEGORIES });
}

export function searchCompetition(
  db: D1Database,
  vectorize: VectorizeIndex,
  ai: Ai,
  question: string,
  competition: string,
) {
  return hybridSearch(db, vectorize, ai, question, { competition });
}
