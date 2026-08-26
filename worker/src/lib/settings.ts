// Admin panelinden yonetilebilen calisma-zamani ayarlari (su an: Gemini API
// anahtari). D1'de sifrelenmis saklanir (bkz. lib/crypto/settingsEncryption).
// Kullanici bir anahtar hic girmediyse, deploy sirasinda `wrangler secret put`
// ile ayarlanan statik GEMINI_API_KEY secret'ina geri dusulur — bu yuzden bu
// ozellik eklenmeden once yapilmis deploy'lar bozulmaz.

import { encryptSecret, decryptSecret } from "./crypto/settingsEncryption";

const GEMINI_SETTING_KEY = "gemini_api_key";

interface SettingsRow {
  value_encrypted: string;
  enabled: number;
}

interface SettingsEnv {
  GEMINI_API_KEY?: string;
  SETTINGS_ENC_KEY?: string;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export interface GeminiKeyStatus {
  configured: boolean; // admin panelinden ozel bir anahtar girilmis mi
  enabled: boolean; // girilmisse, aktif mi
  masked: string | null;
  source: "db" | "secret" | "none"; // su an cagrilarda fiilen kullanilan kaynak
}

async function getRow(db: D1Database): Promise<SettingsRow | null> {
  return db
    .prepare("SELECT value_encrypted, enabled FROM settings WHERE key = ?")
    .bind(GEMINI_SETTING_KEY)
    .first<SettingsRow>();
}

export async function getGeminiKeyStatus(db: D1Database, env: SettingsEnv): Promise<GeminiKeyStatus> {
  const row = await getRow(db);
  if (!row) {
    return {
      configured: false,
      enabled: false,
      masked: env.GEMINI_API_KEY ? maskKey(env.GEMINI_API_KEY) : null,
      source: env.GEMINI_API_KEY ? "secret" : "none",
    };
  }
  let masked: string | null = null;
  try {
    masked = maskKey(await decryptSecret(env.SETTINGS_ENC_KEY, row.value_encrypted));
  } catch {
    masked = null;
  }
  return {
    configured: true,
    enabled: row.enabled === 1,
    masked,
    source: row.enabled === 1 ? "db" : "none",
  };
}

// callLLM'in her /api/ask cagrisinda fiilen kullanacagi anahtari cozer.
// Admin panelden bilincli olarak "devre disi" birakildiysa null doner
// (statik secret'a geri DUSULMEZ — kapatma niyeti acikca korunur).
export async function resolveGeminiApiKey(db: D1Database, env: SettingsEnv): Promise<string | null> {
  const row = await getRow(db);
  if (!row) return env.GEMINI_API_KEY ?? null;
  if (row.enabled !== 1) return null;
  try {
    return await decryptSecret(env.SETTINGS_ENC_KEY, row.value_encrypted);
  } catch {
    return null;
  }
}

export async function setGeminiApiKey(
  db: D1Database,
  env: SettingsEnv,
  apiKey: string,
  updatedBy: string,
): Promise<void> {
  const encrypted = await encryptSecret(env.SETTINGS_ENC_KEY, apiKey);
  await db
    .prepare(
      `INSERT INTO settings (key, value_encrypted, enabled, updated_at, updated_by)
       VALUES (?, ?, 1, datetime('now'), ?)
       ON CONFLICT(key) DO UPDATE SET
         value_encrypted = excluded.value_encrypted,
         enabled = 1,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(GEMINI_SETTING_KEY, encrypted, updatedBy)
    .run();
}

export async function setGeminiKeyEnabled(db: D1Database, enabled: boolean, updatedBy: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE settings SET enabled = ?, updated_at = datetime('now'), updated_by = ? WHERE key = ?`,
    )
    .bind(enabled ? 1 : 0, updatedBy, GEMINI_SETTING_KEY)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteGeminiApiKey(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM settings WHERE key = ?`).bind(GEMINI_SETTING_KEY).run();
}
