// Her route handler'in basinda cagirdigi yetki kontrolleri.
// Referans t3_claudeflare projesindeki desen: merkezi bir middleware zinciri
// yok, her handler kendi ihtiyacina gore bu fonksiyonlari cagirir
// (Ek C, bolum 5). Piri'de auth Bearer token (cookie DEGIL).

import { extractBearerToken, resolveSession } from "./session";
import { getUser, toAuthUser, type AuthUser } from "./users";
import { hasPermission, type Permission } from "../../config/roles";

export function jsonError(detail: string, status: number): Response {
  return Response.json({ detail }, { status });
}

export interface SessionContext {
  token: string;
  user: AuthUser;
}

// require_session'in karsiligi: gecerli bir Bearer token + hala var olan
// bir kullanici gerektirir. Orijinal Python'daki gibi HER istekte kullanici
// DB'den taze okunur (rol degisikligi/hesap silme aninda etkili olur).
export async function requireSession(
  request: Request,
  db: D1Database,
): Promise<SessionContext | Response> {
  const token = extractBearerToken(request);
  if (!token) return jsonError("Oturum gerekli.", 401);

  const username = await resolveSession(db, token);
  if (!username) return jsonError("Oturum geçersiz veya süresi dolmuş.", 401);

  const row = await getUser(db, username);
  if (!row) return jsonError("Kullanıcı bulunamadı.", 401);

  return { token, user: toAuthUser(row) };
}

// require_permission(...)'in karsiligi.
export async function requirePermission(
  request: Request,
  db: D1Database,
  permission: Permission,
): Promise<SessionContext | Response> {
  const ctx = await requireSession(request, db);
  if (ctx instanceof Response) return ctx;
  if (!hasPermission(ctx.user.role, permission)) {
    return jsonError("Bu işlem için yetkiniz yok.", 403);
  }
  return ctx;
}

// require_any_permission(...)'in birebir karsiligi: verilen yetkilerden EN
// AZ birini zorunlu kilar — ornegin /api/admin/unanswered hem soruyu
// yanitlayacak Destek Ekibi'ne (questions.view) hem de sadece toplu
// metrikleri (yanit kalitesi/yonlendirme orani/sik konular) izleyecek
// Sistem Yoneticisi'ne (insights.view) acik olmalidir.
export async function requireAnyPermission(
  request: Request,
  db: D1Database,
  permissions: Permission[],
): Promise<SessionContext | Response> {
  const ctx = await requireSession(request, db);
  if (ctx instanceof Response) return ctx;
  if (!permissions.some((p) => hasPermission(ctx.user.role, p))) {
    return jsonError("Bu işlem için yetkiniz yok.", 403);
  }
  return ctx;
}

// require_owner'in karsiligi: sadece "sahip" rolu (users.manage yetkisinden
// bagimsiz, ozel bir kontrol — Ek A bolum 1'deki nota gore).
export async function requireOwner(
  request: Request,
  db: D1Database,
): Promise<SessionContext | Response> {
  const ctx = await requireSession(request, db);
  if (ctx instanceof Response) return ctx;
  if (ctx.user.role !== "sahip") {
    return jsonError("Bu işlem yalnızca sahip tarafından yapılabilir.", 403);
  }
  return ctx;
}
