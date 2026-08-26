// Belge yönetimi endpoint'leri — Ek A bolum 1 ve Ek B bolum 14 ile
// birebir sozlesme.

import { requirePermission, jsonError } from "../lib/auth/middleware";
import {
  listDocuments,
  setStatus,
  updateMetadata,
  getAllVersions,
  deactivateAllVersions,
  VALID_DOC_TYPES,
  type DocType,
} from "../lib/documents/registry";
import { ingestDocument, purgeDocumentData } from "../lib/documents/ingest";
import type { Env } from "../index";

export async function handleListDocuments(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "sources.view");
  if (ctx instanceof Response) return ctx;

  const { documents, stats } = await listDocuments(env.DB);
  return Response.json({ documents, stats });
}

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "sources.upload");
  if (ctx instanceof Response) return ctx;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Geçersiz form verisi.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("Dosya gerekli.", 400);
  }
  const competitionRaw = form.get("competition");
  const competition = typeof competitionRaw === "string" && competitionRaw.trim() ? competitionRaw.trim() : null;

  const docTypeRaw = form.get("doc_type");
  let docType: DocType | null | undefined = undefined;
  if (typeof docTypeRaw === "string" && docTypeRaw) {
    if (!VALID_DOC_TYPES.includes(docTypeRaw as DocType)) {
      return jsonError(`Geçersiz belge tipi: ${docTypeRaw}`, 400);
    }
    docType = docTypeRaw as DocType;
  }

  const kaynakAdiRaw = form.get("kaynak_adi");
  const kaynakAdi = typeof kaynakAdiRaw === "string" && kaynakAdiRaw ? kaynakAdiRaw : undefined;

  const gecerlilikRaw = form.get("gecerlilik_bitis");
  const gecerlilikBitis = typeof gecerlilikRaw === "string" && gecerlilikRaw ? gecerlilikRaw : undefined;

  try {
    const result = await ingestDocument(env.DB, env.PIRI_DOCS_KV, env.AI, env.VECTORIZE, {
      file,
      competition,
      docType,
      kaynakAdi,
      gecerlilikBitis,
    });
    return Response.json({ file: result.file, chunks: result.chunks });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Belge işlenemedi.", 500);
  }
}

interface StatusBody {
  document_id?: string;
  version?: number;
  status?: string;
}

export async function handleSetStatus(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "sources.status");
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as StatusBody | null;
  if (!body?.document_id || !body.version || (body.status !== "active" && body.status !== "inactive")) {
    return jsonError("Geçersiz istek.", 400);
  }
  await setStatus(env.DB, body.document_id, body.version, body.status);
  return Response.json({ ok: true });
}

interface MetadataBody {
  document_id?: string;
  version?: number;
  doc_type?: DocType | null;
  kaynak_adi?: string | null;
  gecerlilik_bitis?: string | null;
}

export async function handleUpdateMetadata(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "sources.status");
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as MetadataBody | null;
  if (!body?.document_id || !body.version) {
    return jsonError("Geçersiz istek.", 400);
  }
  if (body.doc_type && !VALID_DOC_TYPES.includes(body.doc_type)) {
    return jsonError(`Geçersiz belge tipi: ${body.doc_type}`, 400);
  }
  await updateMetadata(env.DB, body.document_id, body.version, {
    docType: body.doc_type,
    kaynakAdi: body.kaynak_adi,
    gecerlilikBitis: body.gecerlilik_bitis,
  });
  return Response.json({ ok: true });
}

interface DeleteBody {
  document_id?: string;
}

export async function handleDeleteDocument(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "sources.delete");
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as DeleteBody | null;
  if (!body?.document_id) {
    return jsonError("Geçersiz istek.", 400);
  }

  const versions = await getAllVersions(env.DB, body.document_id);
  await deactivateAllVersions(env.DB, body.document_id);
  await purgeDocumentData(
    env.DB,
    env.PIRI_DOCS_KV,
    env.VECTORIZE,
    body.document_id,
    versions.map((v) => v.source_path).filter((p): p is string => !!p),
  );

  return Response.json({ ok: true });
}
