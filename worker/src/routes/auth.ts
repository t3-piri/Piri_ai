// POST /api/admin/login, POST /api/admin/logout, GET /api/admin/me
// Ek A bolum 1 ve Ek B bolum 1'deki sozlesmeye birebir uyar.

import { ensureOwner, verifyCredentials, toAuthUser } from "../lib/auth/users";
import { createSession, destroySession, extractBearerToken } from "../lib/auth/session";
import { requireSession, jsonError } from "../lib/auth/middleware";
import { roleCatalog } from "../config/roles";
import type { Env } from "../index";

interface LoginBody {
  username?: string;
  password?: string;
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Geçersiz istek gövdesi.", 400);
  }
  const username = body.username?.trim();
  const password = body.password;
  if (!username || !password) {
    return jsonError("Kullanıcı adı ve şifre gerekli.", 400);
  }

  // ensure_owner() karsiligi: users tablosu bossa, ilk giris denemesinden
  // once tek seferlik sahip hesabini olustur.
  await ensureOwner(env.DB, env);

  const user = await verifyCredentials(env.DB, username, password);
  if (!user) {
    return jsonError("Kullanıcı adı veya şifre hatalı.", 401);
  }

  const token = await createSession(env.DB, user.username);
  return Response.json({ token, user: toAuthUser(user) });
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const ctx = await requireSession(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const token = extractBearerToken(request);
  if (token) await destroySession(env.DB, token);
  return Response.json({ ok: true });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const ctx = await requireSession(request, env.DB);
  if (ctx instanceof Response) return ctx;

  return Response.json({ user: ctx.user, roles: roleCatalog() });
}
