// Kullanıcı/rol yönetimi endpoint'leri — Ek A bölüm 1 ile birebir.

import { requirePermission, requireOwner, jsonError } from "../lib/auth/middleware";
import {
  listUsers,
  createUser,
  setRole,
  setPassword,
  deleteUser,
  transferOwnership,
  toListRow,
  UserError,
} from "../lib/auth/users";
import { destroyAllSessionsForUser } from "../lib/auth/session";
import { roleCatalog, hasPermission, type RoleKey } from "../config/roles";
import type { Env } from "../index";

function handleUserError(err: unknown): Response {
  if (err instanceof UserError) return jsonError(err.message, 400);
  throw err;
}

export async function handleListUsers(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "users.view");
  if (ctx instanceof Response) return ctx;

  const users = await listUsers(env.DB);
  return Response.json({
    users,
    roles: roleCatalog(),
    can_manage: hasPermission(ctx.user.role, "users.manage"),
    is_owner: ctx.user.role === "sahip",
  });
}

interface CreateUserBody {
  username?: string;
  password?: string;
  role?: string;
  display_name?: string | null;
}

export async function handleCreateUser(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "users.manage");
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as CreateUserBody | null;
  if (!body?.username || !body.password || !body.role) {
    return jsonError("Geçersiz istek.", 400);
  }
  try {
    const created = await createUser(env.DB, {
      username: body.username,
      password: body.password,
      role: body.role as RoleKey,
      display_name: body.display_name,
      created_by: ctx.user.username,
    });
    return Response.json({ ok: true, user: toListRow(created) });
  } catch (err) {
    return handleUserError(err);
  }
}

interface RoleBody {
  username?: string;
  role?: string;
}

export async function handleSetRole(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "users.manage");
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as RoleBody | null;
  if (!body?.username || !body.role) return jsonError("Geçersiz istek.", 400);
  if (body.username === ctx.user.username) {
    return jsonError("Kendi rolünüzü değiştiremezsiniz.", 400);
  }
  try {
    const updated = await setRole(env.DB, body.username, body.role as RoleKey);
    return Response.json({ ok: true, user: toListRow(updated) });
  } catch (err) {
    return handleUserError(err);
  }
}

interface PasswordBody {
  username?: string;
  password?: string;
}

export async function handleSetPassword(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "users.manage");
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as PasswordBody | null;
  if (!body?.username || !body.password) return jsonError("Geçersiz istek.", 400);
  try {
    await setPassword(env.DB, body.username, body.password);
    return Response.json({ ok: true });
  } catch (err) {
    return handleUserError(err);
  }
}

interface UsernameBody {
  username?: string;
}

export async function handleDeleteUser(request: Request, env: Env): Promise<Response> {
  const ctx = await requirePermission(request, env.DB, "users.manage");
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as UsernameBody | null;
  if (!body?.username) return jsonError("Geçersiz istek.", 400);
  if (body.username === ctx.user.username) {
    return jsonError("Kendi hesabınızı silemezsiniz.", 400);
  }
  try {
    await deleteUser(env.DB, body.username);
    await destroyAllSessionsForUser(env.DB, body.username);
    return Response.json({ ok: true });
  } catch (err) {
    return handleUserError(err);
  }
}

export async function handleTransferOwner(request: Request, env: Env): Promise<Response> {
  const ctx = await requireOwner(request, env.DB);
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => null)) as UsernameBody | null;
  if (!body?.username) return jsonError("Geçersiz istek.", 400);
  try {
    const newOwner = await transferOwnership(env.DB, ctx.user.username, body.username);
    return Response.json({ ok: true, user: toListRow(newOwner) });
  } catch (err) {
    return handleUserError(err);
  }
}
