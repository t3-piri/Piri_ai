// Belge alma hattı (upload -> extract -> chunk -> embed -> D1+Vectorize).
// backend/web_app.py'nin POST /api/admin/upload'inin tek-adimda yaptigi
// islemin (Ek A, bolum 1) Worker karsiligi.

import { extractMarkdown, splitByPageMarkers } from "../rag/extraction";
import { chunkBlocks } from "../rag/chunking";
import { embedDocuments } from "../ai/embeddingProvider";
import { foldTurkish } from "../rag/turkishFold";
import {
  documentIdFor,
  registerNewVersion,
  type DocType,
  type DocumentRow,
} from "./registry";

// backend/local_ingest.py SPECIAL_CATEGORIES ile birebir (tam bu yazımla:
// "kuralar" tek L — orijinal kaynakta boyle, competitions.py'deki
// GENERAL_FOLDERS ile de eslesiyor).
const SPECIAL_CATEGORIES: Record<string, "genel" | "sss"> = {
  "Genel ve Etik kuralar": "genel",
  SSS: "sss",
};

// local_ingest.py'deki SPECIAL_CATEGORIES mantiginin karsiligi.
function deriveCategory(competition: string | null): "genel" | "sss" | "yarisma" {
  if (!competition) return "genel";
  return SPECIAL_CATEGORIES[competition] ?? "yarisma";
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fileTypeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext;
}

const EMBED_BATCH_SIZE = 20;

export interface IngestParams {
  file: File;
  competition: string | null;
  docType?: DocType | null;
  kaynakAdi?: string | null;
  gecerlilikBitis?: string | null;
}

export interface IngestResult {
  file: string;
  chunks: number;
  document: DocumentRow;
}

export async function ingestDocument(
  db: D1Database,
  kv: KVNamespace,
  ai: Ai,
  vectorize: VectorizeIndex,
  params: IngestParams,
): Promise<IngestResult> {
  const fileName = params.file.name;
  const documentId = documentIdFor(params.competition, fileName);
  const category = deriveCategory(params.competition);

  const arrayBuffer = await params.file.arrayBuffer();
  const storageKey = `docs/${crypto.randomUUID()}/${fileName}`;
  await kv.put(storageKey, arrayBuffer, {
    metadata: { contentType: params.file.type || "application/octet-stream" },
  });

  const document = await registerNewVersion(db, {
    documentId,
    fileName,
    competition: params.competition,
    category,
    sourcePath: storageKey,
    docType: params.docType,
    kaynakAdi: params.kaynakAdi,
    gecerlilikBitis: params.gecerlilikBitis,
  });

  const markdown = await extractMarkdown(ai, {
    name: fileName,
    blob: new Blob([arrayBuffer], { type: params.file.type }),
  });
  const blocks = splitByPageMarkers(markdown);
  const chunks = chunkBlocks(blocks);

  if (chunks.length === 0) {
    return { file: fileName, chunks: 0, document };
  }

  const fileType = fileTypeFromName(fileName);
  const chunkIds = await Promise.all(
    chunks.map((c, idx) =>
      sha256Hex(`${documentId}|${c.locator ?? ""}|${idx}|v${document.version}`),
    ),
  );

  for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBED_BATCH_SIZE);
    const batchIds = chunkIds.slice(start, start + EMBED_BATCH_SIZE);
    const vectors = await embedDocuments(
      ai,
      batch.map((c) => c.text),
    );

    const statements = batch.map((chunk, i) =>
      db
        .prepare(
          `INSERT INTO document_chunks
             (id, document_id, version, competition, category, file_name, file_type, locator, content, content_folded, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        )
        .bind(
          batchIds[i],
          documentId,
          document.version,
          params.competition,
          category,
          fileName,
          fileType,
          chunk.locator,
          chunk.text,
          foldTurkish(chunk.text),
        ),
    );
    await db.batch(statements);

    await vectorize.upsert(
      batch.map((chunk, i) => ({
        id: batchIds[i],
        values: vectors[i],
        metadata: {
          documentId,
          competition: params.competition ?? "",
          category,
          status: "active",
          version: document.version,
        },
      })),
    );
  }

  return { file: fileName, chunks: chunks.length, document };
}

// Belge tamamen silinirken (POST /api/admin/documents/delete) kullanilir:
// KV dosyalari + D1 chunk'lari + Vectorize vektorleri fiziksel olarak
// silinir (registry.deactivateAllVersions ayri cagirilir, o satirlari
// silmez — Ek A bolum 3'teki gibi).
export async function purgeDocumentData(
  db: D1Database,
  kv: KVNamespace,
  vectorize: VectorizeIndex,
  documentId: string,
  sourcePaths: string[],
): Promise<void> {
  const { results } = await db
    .prepare("SELECT id FROM document_chunks WHERE document_id = ?")
    .bind(documentId)
    .all<{ id: string }>();

  if (results.length > 0) {
    await vectorize.deleteByIds(results.map((r) => r.id));
  }
  await db.prepare("DELETE FROM document_chunks WHERE document_id = ?").bind(documentId).run();

  await Promise.all(sourcePaths.filter(Boolean).map((key) => kv.delete(key)));
}
