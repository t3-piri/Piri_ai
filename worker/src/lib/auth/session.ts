// Bearer token oturum yonetimi — D1'de kalici (FAZ 0 karari: mevcut Python
// backend'in bellek-ici/restart'ta-dusen davranisindan bilincli sapma).
// Ham token asla D1'e yazilmaz, yalnizca SHA-256 hash'i (referans
// t3_claudeflare projesindeki session.ts deseniyle ayni fikir).

const SESSION_DAYS = 7;

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createSession(db: D1Database, username: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare("INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, username, expiresAt)
    .run();
  return token;
}

export async function resolveSession(db: D1Database, token: string): Promise<string | null> {
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT username, expires_at FROM sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ username: string; expires_at: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    // Suresi dolmus — temizle ve gecersiz say.
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return row.username;
}

export async function destroySession(db: D1Database, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

// Bir kullanicinin TUM oturumlarini dusurur — rol degisikligi/hesap
// silme/deaktivasyon aninda kullanilir (backend/users.py'deki
// destroyAllSessionsForUser-benzeri davranis, Ek A bolum 1'deki
// "ilgili tum session'lari dusurur" notuna karsilik gelir).
export async function destroyAllSessionsForUser(db: D1Database, username: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE username = ?").bind(username).run();
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}
