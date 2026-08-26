// Workers AI embedding sarmalayicisi — backend/local_embed.py'nin Worker
// karsiligi. Asimetrik API (Ek C, bolum 6): dokumanlar icin `documents`,
// sorgu icin `queries` alani. Orijinaldeki "passage: "/"query: " on-eki
// modelin kendi API sozlesmesiyle degisti; anlam ayni (dokuman vs sorgu
// embedding'i farkli hazirlanir).

import { EMBEDDING_MODEL } from "../../config/models";
import { withTimeout } from "../withTimeout";

// Toplu (ingest sirasinda, 20'li batch) ve tekli (sorgu aninda, /api/ask
// icinde) cagrilarin gecikme profili farkli oldugu icin ayri sureler.
const BATCH_TIMEOUT_MS = 60_000;
const QUERY_TIMEOUT_MS = 20_000;

// Ek C'deki not: uretilen Workers AI tipleri bosluklu olabilir; girdi
// nesnesini ayri bir degiskende olusturmak (inline literal degil) TS'in
// asiri-ozellik kontrolunu ve overload belirsizligini bertaraf ediyor.
export async function embedDocuments(ai: Ai, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const input: Ai_Cf_Qwen_Qwen3_Embedding_0_6B_Input = { documents: texts };
  const result = await withTimeout(ai.run(EMBEDDING_MODEL, input), BATCH_TIMEOUT_MS, "Embedding (documents)");
  if (!result.data) throw new Error("Embedding sonucu boş döndü.");
  return result.data;
}

export async function embedQuery(ai: Ai, text: string): Promise<number[]> {
  const input: Ai_Cf_Qwen_Qwen3_Embedding_0_6B_Input = { queries: [text] };
  const result = await withTimeout(ai.run(EMBEDDING_MODEL, input), QUERY_TIMEOUT_MS, "Embedding (query)");
  if (!result.data?.[0]) throw new Error("Sorgu embedding sonucu boş döndü.");
  return result.data[0];
}
