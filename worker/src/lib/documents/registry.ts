// backend/document_registry.py'nin D1 karsiligi — birebir davranis:
// active/inactive + version increment, eski versiyon ASLA silinmez
// (yalnizca inactive yapilir). CLOUDFLARE_MIGRATION_MASTER_PROMPT.md
// Ek A, bolum 3.

export const VALID_DOC_TYPES = ["sartname", "kilavuz", "sss"] as const;
export type DocType = (typeof VALID_DOC_TYPES)[number];

export interface DocumentRow {
  id: number;
  document_id: string;
  file_name: string;
  competition: string | null;
  category: string | null;
  source_path: string | null;
  version: number;
  status: "active" | "inactive";
  upload_date: string;
  doc_type: DocType | null;
  kaynak_adi: string | null;
  gecerlilik_bitis: string | null;
}

export function documentIdFor(competition: string | null, fileName: string): string {
  return `${competition || "genel"}::${fileName}`;
}

async function getActiveVersion(
  db: D1Database,
  documentId: string,
): Promise<DocumentRow | null> {
  return db
    .prepare("SELECT * FROM documents WHERE document_id = ? AND status = 'active'")
    .bind(documentId)
    .first<DocumentRow>();
}

async function getMaxVersion(db: D1Database, documentId: string): Promise<number> {
  const row = await db
    .prepare("SELECT MAX(version) as v FROM documents WHERE document_id = ?")
    .bind(documentId)
    .first<{ v: number | null }>();
  return row?.v ?? 0;
}

export interface RegisterVersionParams {
  documentId: string;
  fileName: string;
  competition: string | null;
  category: string | null;
  sourcePath: string;
  docType?: DocType | null;
  kaynakAdi?: string | null;
  gecerlilikBitis?: string | null;
}

// register_new_version()'in birebir karsiligi: mevcut active satiri
// inactive yapar (silmez), MAX(version)+1 ile yeni active satir ekler.
// doc_type/kaynak_adi/gecerlilik_bitis verilmezse onceki active
// versiyondan miras alinir (geriye donuk uyumluluk, orijinaldeki gibi).
export async function registerNewVersion(
  db: D1Database,
  params: RegisterVersionParams,
): Promise<DocumentRow> {
  const previous = await getActiveVersion(db, params.documentId);

  if (previous) {
    await db
      .prepare("UPDATE documents SET status = 'inactive' WHERE id = ?")
      .bind(previous.id)
      .run();
    // Eski versiyonun chunk'lari da silinmez, sadece inactive isaretlenir
    // (aramadan dusmesi icin) — bkz. deactivateChunksForVersion.
    await deactivateChunksForVersion(db, params.documentId, previous.version);
  }

  const nextVersion = (await getMaxVersion(db, params.documentId)) + 1;
  const docType = params.docType ?? previous?.doc_type ?? null;
  const kaynakAdi = params.kaynakAdi ?? previous?.kaynak_adi ?? null;
  const gecerlilikBitis = params.gecerlilikBitis ?? previous?.gecerlilik_bitis ?? null;

  await db
    .prepare(
      `INSERT INTO documents
         (document_id, file_name, competition, category, source_path, version, status, doc_type, kaynak_adi, gecerlilik_bitis)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    )
    .bind(
      params.documentId,
      params.fileName,
      params.competition,
      params.category,
      params.sourcePath,
      nextVersion,
      docType,
      kaynakAdi,
      gecerlilikBitis,
    )
    .run();

  const created = await db
    .prepare("SELECT * FROM documents WHERE document_id = ? AND version = ?")
    .bind(params.documentId, nextVersion)
    .first<DocumentRow>();
  if (!created) throw new Error("Belge kaydı oluşturulamadı.");
  return created;
}

export async function deactivateChunksForVersion(
  db: D1Database,
  documentId: string,
  version: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE document_chunks SET status = 'inactive' WHERE document_id = ? AND version = ?",
    )
    .bind(documentId, version)
    .run();
}

export async function listDocuments(
  db: D1Database,
): Promise<{ documents: DocumentRow[]; stats: { total: number; active: number; inactive: number; chunks: number } }> {
  const { results } = await db
    .prepare("SELECT * FROM documents ORDER BY upload_date DESC")
    .all<DocumentRow>();

  const total = results.length;
  const active = results.filter((d) => d.status === "active").length;
  const inactive = total - active;

  const chunksRow = await db
    .prepare("SELECT COUNT(*) as n FROM document_chunks")
    .first<{ n: number }>();

  return {
    documents: results,
    stats: { total, active, inactive, chunks: chunksRow?.n ?? 0 },
  };
}

export async function setStatus(
  db: D1Database,
  documentId: string,
  version: number,
  status: "active" | "inactive",
): Promise<void> {
  await db
    .prepare("UPDATE documents SET status = ? WHERE document_id = ? AND version = ?")
    .bind(status, documentId, version)
    .run();
  await db
    .prepare("UPDATE document_chunks SET status = ? WHERE document_id = ? AND version = ?")
    .bind(status, documentId, version)
    .run();
}

export async function updateMetadata(
  db: D1Database,
  documentId: string,
  version: number,
  fields: { docType?: DocType | null; kaynakAdi?: string | null; gecerlilikBitis?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.docType !== undefined) {
    sets.push("doc_type = ?");
    values.push(fields.docType);
  }
  if (fields.kaynakAdi !== undefined) {
    sets.push("kaynak_adi = ?");
    values.push(fields.kaynakAdi);
  }
  if (fields.gecerlilikBitis !== undefined) {
    sets.push("gecerlilik_bitis = ?");
    values.push(fields.gecerlilikBitis);
  }
  if (sets.length === 0) return;
  values.push(documentId, version);
  await db
    .prepare(`UPDATE documents SET ${sets.join(", ")} WHERE document_id = ? AND version = ?`)
    .bind(...values)
    .run();
}

// ensure_registered()'in karsiligi: sadece document_id hic yoksa version=1/
// active ekler (SSS panel kayitlari bunu kullanir); zaten varsa dokunmaz.
export async function ensureRegistered(
  db: D1Database,
  params: {
    documentId: string;
    fileName: string;
    competition: string | null;
    category: string;
  },
): Promise<void> {
  const existing = await db
    .prepare("SELECT id FROM documents WHERE document_id = ? LIMIT 1")
    .bind(params.documentId)
    .first();
  if (existing) return;
  await db
    .prepare(
      `INSERT INTO documents (document_id, file_name, competition, category, source_path, version, status)
       VALUES (?, ?, ?, ?, NULL, 1, 'active')`,
    )
    .bind(params.documentId, params.fileName, params.competition, params.category)
    .run();
}

export async function getAllVersions(db: D1Database, documentId: string): Promise<DocumentRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM documents WHERE document_id = ?")
    .bind(documentId)
    .all<DocumentRow>();
  return results;
}

// deactivate_all_versions()'in karsiligi: registry satirlari SILINMEZ,
// sadece hepsi inactive yapilir (Ek A bolum 3'teki davranisla birebir).
export async function deactivateAllVersions(db: D1Database, documentId: string): Promise<void> {
  await db
    .prepare("UPDATE documents SET status = 'inactive' WHERE document_id = ?")
    .bind(documentId)
    .run();
  await db
    .prepare("UPDATE document_chunks SET status = 'inactive' WHERE document_id = ?")
    .bind(documentId)
    .run();
}
