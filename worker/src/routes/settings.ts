// Admin panelinden Gemini API anahtarini yonetme endpoint'leri. Sadece
// sahip rolu erisebilir (mevcut yetki matrisinde ayarlara ozel bir izin
// anahtari yok — requireOwner, transfer_owner gibi ozel islemlerde de
// kullanilan ayni desen).

import { requireOwner, jsonError } from "../lib/auth/middleware";
import { getGeminiKeyStatus, setGeminiApiKey, setGeminiKeyEnabled, deleteGeminiApiKey } from "../lib/settings";
import type { Env } from "../index";

export async function handleGetGeminiSettings(request: Request, env: Env): Promise<Response> {
  const ctx = await requireOwner(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const status = await getGeminiKeyStatus(env.DB, env);
  return Response.json(status);
}

interface SetKeyBody {
  api_key?: string;
}

export async function handleSetGeminiKey(request: Request, env: Env): Promise<Response> {
  const ctx = await requireOwner(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as SetKeyBody | null;
  const apiKey = (body?.api_key ?? "").trim();
  if (!apiKey) return jsonError("API anahtarı boş olamaz.", 400);

  await setGeminiApiKey(env.DB, env, apiKey, ctx.user.username);
  const status = await getGeminiKeyStatus(env.DB, env);
  return Response.json(status);
}

interface ToggleBody {
  enabled?: boolean;
}

export async function handleToggleGeminiKey(request: Request, env: Env): Promise<Response> {
  const ctx = await requireOwner(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as ToggleBody | null;
  if (typeof body?.enabled !== "boolean") return jsonError("Geçersiz istek.", 400);

  const changed = await setGeminiKeyEnabled(env.DB, body.enabled, ctx.user.username);
  if (!changed) return jsonError("Önce bir API anahtarı kaydedilmeli.", 400);

  const status = await getGeminiKeyStatus(env.DB, env);
  return Response.json(status);
}

export async function handleDeleteGeminiKey(request: Request, env: Env): Promise<Response> {
  const ctx = await requireOwner(request, env.DB);
  if (ctx instanceof Response) return ctx;

  await deleteGeminiApiKey(env.DB);
  const status = await getGeminiKeyStatus(env.DB, env);
  return Response.json(status);
}
