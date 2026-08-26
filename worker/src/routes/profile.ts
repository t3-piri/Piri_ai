// "Profilim" endpoint'leri — Ek A bölüm 1 ile birebir. Herkes kendi
// hesabını düzenler (rol farketmez, sadece oturum yeter).

import { requireSession, jsonError } from "../lib/auth/middleware";
import { setDisplayName, setAvatarPath, changeOwnPassword, toAuthUser, UserError } from "../lib/auth/users";
import { validateAvatar, AvatarValidationError } from "../lib/auth/avatarValidation";
import type { Env } from "../index";

function handleUserError(err: unknown): Response {
  if (err instanceof UserError) return jsonError(err.message, 400);
  if (err instanceof AvatarValidationError) return jsonError(err.message, err.status);
  throw err;
}

interface ProfileBody {
  display_name?: string;
}

export async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  const ctx = await requireSession(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as ProfileBody | null;
  if (!body?.display_name) return jsonError("Geçersiz istek.", 400);
  try {
    const updated = await setDisplayName(env.DB, ctx.user.username, body.display_name);
    return Response.json({ ok: true, user: toAuthUser(updated) });
  } catch (err) {
    return handleUserError(err);
  }
}

export async function handleUploadPhoto(request: Request, env: Env): Promise<Response> {
  const ctx = await requireSession(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("Dosya gerekli.", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  let ext: string;
  try {
    ext = validateAvatar(file.name, bytes);
  } catch (err) {
    return handleUserError(err);
  }

  const username = ctx.user.username;
  // Onceki fotograf farkli bir uzantiyla yuklenmis olabilir - hepsini temizle
  // (uzanti sabit set'ten geldigi icin sabit bir liste taranir).
  await Promise.all(
    [".png", ".jpg", ".jpeg", ".webp", ".gif"].map((e) =>
      env.PIRI_DOCS_KV.delete(`avatar/${username}${e}`),
    ),
  );

  const filename = `${username}${ext}`;
  await env.PIRI_DOCS_KV.put(`avatar/${filename}`, bytes, {
    metadata: { contentType: file.type || "application/octet-stream" },
  });

  try {
    const updated = await setAvatarPath(env.DB, username, filename);
    return Response.json({ ok: true, user: toAuthUser(updated) });
  } catch (err) {
    return handleUserError(err);
  }
}

export async function handleDeletePhoto(request: Request, env: Env): Promise<Response> {
  const ctx = await requireSession(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const username = ctx.user.username;
  await Promise.all(
    [".png", ".jpg", ".jpeg", ".webp", ".gif"].map((e) =>
      env.PIRI_DOCS_KV.delete(`avatar/${username}${e}`),
    ),
  );
  try {
    const updated = await setAvatarPath(env.DB, username, null);
    return Response.json({ ok: true, user: toAuthUser(updated) });
  } catch (err) {
    return handleUserError(err);
  }
}

interface SelfPasswordBody {
  current_password?: string;
  new_password?: string;
}

export async function handleChangeOwnPassword(request: Request, env: Env): Promise<Response> {
  const ctx = await requireSession(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as SelfPasswordBody | null;
  if (!body?.current_password || !body.new_password) return jsonError("Geçersiz istek.", 400);
  try {
    await changeOwnPassword(env.DB, ctx.user.username, body.current_password, body.new_password);
    return Response.json({ ok: true });
  } catch (err) {
    return handleUserError(err);
  }
}

// GET /avatars/{filename} — orijinaldeki statik dosya sunumunun karsiligi
// (Ek A: "avatar_url" bu path'i isaret ediyor).
export async function handleGetAvatar(_request: Request, env: Env, filename: string): Promise<Response> {
  const object = await env.PIRI_DOCS_KV.getWithMetadata(`avatar/${filename}`, "arrayBuffer");
  if (!object.value) return new Response("Not found", { status: 404 });
  const contentType = (object.metadata as { contentType?: string } | null)?.contentType ?? "application/octet-stream";
  return new Response(object.value, {
    headers: { "Content-Type": contentType, "Cache-Control": "no-store, must-revalidate" },
  });
}
