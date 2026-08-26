// backend/users.py'nin D1 karsiligi: kullanici CRUD + ensure_owner() bootstrap.
// Kaynaktan (backend/users.py) birebir dogrulanmis: username ASCII/bosluksuz
// + lowercase, sifre min 4 karakter, role ASSIGNABLE_ROLES icinde olmali
// (create_user icin) — ensure_owner ise bu dogrulamalari BYPASS eden HAM bir
// insert yapar (orijinalde de oyle: ensure_owner create_user'i cagirmiyor).

import { hashPassword, verifyPassword } from "./password";
import { permissionsFor, ROLES, type RoleKey, isValidRole } from "../../config/roles";

export interface UserRow {
  username: string;
  display_name: string;
  role: RoleKey;
  salt: string;
  pw_hash: string;
  created_at: string;
  created_by: string | null;
  last_login: string | null;
  avatar_path: string | null;
}

// /api/admin/users listesinde donen sekil (Ek B UserRow) — sifre alanlari
// (salt/pw_hash) ASLA disari sizmaz.
export interface UserListRow {
  username: string;
  display_name: string;
  role: RoleKey;
  role_label: string;
  created_at: string;
  created_by: string | null;
  last_login: string | null;
  avatar_path: string | null;
}

export interface AuthUser {
  username: string;
  display_name: string;
  role: RoleKey;
  role_label: string;
  is_owner: boolean;
  permissions: string[];
  avatar_url: string | null;
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    role_label: ROLES[row.role].label,
    is_owner: row.role === "sahip",
    permissions: permissionsFor(row.role),
    avatar_url: row.avatar_path ? `/avatars/${row.avatar_path}` : null,
  };
}

export function toListRow(row: UserRow): UserListRow {
  return {
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    role_label: ROLES[row.role].label,
    created_at: row.created_at,
    created_by: row.created_by,
    last_login: row.last_login,
    avatar_path: row.avatar_path,
  };
}

export async function getUser(db: D1Database, username: string): Promise<UserRow | null> {
  return db
    .prepare("SELECT * FROM users WHERE username = ?")
    .bind(username)
    .first<UserRow>();
}

// list_users()'in birebir karsiligi: rol rank'ine, sonra kullanici adina
// gore siralanir.
export async function listUsers(db: D1Database): Promise<UserListRow[]> {
  const { results } = await db.prepare("SELECT * FROM users").all<UserRow>();
  const sorted = [...results].sort((a, b) => {
    const rankDiff = ROLES[a.role].rank - ROLES[b.role].rank;
    return rankDiff !== 0 ? rankDiff : a.username.localeCompare(b.username);
  });
  return sorted.map(toListRow);
}

export async function userCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) as n FROM users").first<{ n: number }>();
  return row?.n ?? 0;
}

export class UserError extends Error {}

const ASSIGNABLE_ROLES: RoleKey[] = (Object.keys(ROLES) as RoleKey[]).filter(
  (r) => r !== "sahip",
);

function validateUsername(username: string): string {
  const cleaned = (username || "").trim().toLowerCase();
  if (!cleaned || !/^[\x00-\x7F]+$/.test(cleaned) || cleaned.includes(" ")) {
    throw new UserError("Kullanıcı adı boşluksuz ve ASCII olmalı.");
  }
  return cleaned;
}

function validatePassword(password: string): void {
  if ((password || "").length < 4) {
    throw new UserError("Şifre en az 4 karakter olmalı.");
  }
}

// create_user()'in birebir karsiligi — public /api/admin/users POST bunu
// kullanir, 'sahip' rolu burada asla kabul edilmez.
export async function createUser(
  db: D1Database,
  params: { username: string; password: string; role: RoleKey; display_name?: string | null; created_by?: string | null },
): Promise<UserRow> {
  const username = validateUsername(params.username);
  validatePassword(params.password);
  if (!ASSIGNABLE_ROLES.includes(params.role)) {
    throw new UserError("Sahip rolü yeni hesaba verilemez; devretmek için sahipliği aktarın.");
  }
  const existing = await getUser(db, username);
  if (existing) {
    throw new UserError("Bu kullanıcı adı zaten var.");
  }
  const { salt, pw_hash } = await hashPassword(params.password);
  const display_name = (params.display_name || username).trim();
  await db
    .prepare(
      `INSERT INTO users (username, display_name, role, salt, pw_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(username, display_name, params.role, salt, pw_hash, params.created_by ?? null)
    .run();
  const created = await getUser(db, username);
  if (!created) throw new UserError("Kullanıcı oluşturulamadı.");
  return created;
}

export async function verifyCredentials(
  db: D1Database,
  username: string,
  password: string,
): Promise<UserRow | null> {
  const user = await getUser(db, username.trim());
  if (!user) return null;
  const ok = await verifyPassword(password, { salt: user.salt, pw_hash: user.pw_hash });
  if (!ok) return null;
  await db
    .prepare("UPDATE users SET last_login = datetime('now') WHERE username = ?")
    .bind(username)
    .run();
  return user;
}

// ensure_owner()'in birebir karsiligi: create_user()'i BYPASS eden ham
// insert (env'den gelen guvenilir degerler icin dogrulama uygulanmaz —
// orijinalde de boyle).
export async function ensureOwner(
  db: D1Database,
  env: { OWNER_USERNAME?: string; ADMIN_PASSWORD?: string; OWNER_DISPLAY_NAME?: string },
): Promise<string | null> {
  const count = await userCount(db);
  if (count > 0) return null;

  const username = (env.OWNER_USERNAME || "sahip").trim();
  const password = env.ADMIN_PASSWORD || "admin123";
  const displayName = env.OWNER_DISPLAY_NAME || "Sistem Sahibi";
  const { salt, pw_hash } = await hashPassword(password);

  await db
    .prepare(
      `INSERT INTO users (username, display_name, role, salt, pw_hash)
       VALUES (?, ?, 'sahip', ?, ?)`,
    )
    .bind(username, displayName, salt, pw_hash)
    .run();
  return username;
}

export async function setRole(db: D1Database, username: string, role: RoleKey): Promise<UserRow> {
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new UserError("Geçersiz rol. Sahiplik yalnızca devir ile değişir.");
  }
  const user = await getUser(db, username);
  if (!user) throw new UserError("Kullanıcı bulunamadı.");
  if (user.role === "sahip") {
    throw new UserError("Sahibin rolü değiştirilemez; önce sahipliği devredin.");
  }
  await db.prepare("UPDATE users SET role = ? WHERE username = ?").bind(role, username).run();
  return (await getUser(db, username))!;
}

export async function setPassword(db: D1Database, username: string, password: string): Promise<void> {
  validatePassword(password);
  const user = await getUser(db, username);
  if (!user) throw new UserError("Kullanıcı bulunamadı.");
  const { salt, pw_hash } = await hashPassword(password);
  await db
    .prepare("UPDATE users SET salt = ?, pw_hash = ? WHERE username = ?")
    .bind(salt, pw_hash, username)
    .run();
}

export async function changeOwnPassword(
  db: D1Database,
  username: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const verified = await verifyCredentials(db, username, currentPassword);
  if (!verified) throw new UserError("Mevcut şifre yanlış.");
  await setPassword(db, username, newPassword);
}

export async function setDisplayName(
  db: D1Database,
  username: string,
  displayName: string,
): Promise<UserRow> {
  const cleaned = (displayName || "").trim();
  if (!cleaned) throw new UserError("Görünen ad boş olamaz.");
  const user = await getUser(db, username);
  if (!user) throw new UserError("Kullanıcı bulunamadı.");
  await db
    .prepare("UPDATE users SET display_name = ? WHERE username = ?")
    .bind(cleaned, username)
    .run();
  return (await getUser(db, username))!;
}

export async function setAvatarPath(
  db: D1Database,
  username: string,
  avatarPath: string | null,
): Promise<UserRow> {
  const user = await getUser(db, username);
  if (!user) throw new UserError("Kullanıcı bulunamadı.");
  await db
    .prepare("UPDATE users SET avatar_path = ? WHERE username = ?")
    .bind(avatarPath, username)
    .run();
  return (await getUser(db, username))!;
}

export async function deleteUser(db: D1Database, username: string): Promise<void> {
  const user = await getUser(db, username);
  if (!user) throw new UserError("Kullanıcı bulunamadı.");
  if (user.role === "sahip") throw new UserError("Sahip hesabı silinemez.");
  await db.prepare("DELETE FROM users WHERE username = ?").bind(username).run();
}

export async function transferOwnership(
  db: D1Database,
  currentOwner: string,
  newOwner: string,
): Promise<UserRow> {
  const target = await getUser(db, newOwner);
  if (!target) throw new UserError("Devredilecek kullanıcı bulunamadı.");
  if (target.role === "sahip") throw new UserError("Bu kullanıcı zaten sahip.");
  // Sahiplik tek kisidedir: yeni sahip atanirken eski sahip
  // 'icerik_yoneticisi' olur (Sahip disinda en genis islevsel rol —
  // Kullanicilar panelinden farkli bir rol verilebilir). Eskiden 'yonetici'
  // rolu vardi, kaldirildi (bkz. config/roles.ts notu).
  await db.prepare("UPDATE users SET role = 'icerik_yoneticisi' WHERE username = ?").bind(currentOwner).run();
  await db.prepare("UPDATE users SET role = 'sahip' WHERE username = ?").bind(newOwner).run();
  return (await getUser(db, newOwner))!;
}

export { isValidRole };
