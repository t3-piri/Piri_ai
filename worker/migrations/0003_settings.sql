-- Admin panelinden yonetilebilen calisma-zamani ayarlari (ilk kullanim:
-- Gemini API anahtari). Deger her zaman sifreli saklanir (bkz.
-- src/lib/crypto/settingsEncryption.ts).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_encrypted TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
