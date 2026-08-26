-- Piri D1 semasi — CLOUDFLARE_MIGRATION_MASTER_PROMPT.md Ek A'daki
-- davranissal sozlesmenin birebir karsiligi. Roller/yetkiler DB tablosu
-- degil, orijinal Python'daki gibi kod icinde sabit (worker/src/config/roles.ts).

CREATE TABLE users (
  username     TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('sahip','yonetici','icerik_yoneticisi','destek_ekibi','izleyici')),
  salt         TEXT NOT NULL,
  pw_hash      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_by   TEXT,
  last_login   TEXT,
  avatar_path  TEXT
);

-- Kalici oturumlar (FAZ 0 karari: mevcut bellek-ici davranistan bilincli
-- sapma). Ham token asla saklanmaz, yalnizca SHA-256 hash'i.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_username ON sessions(username);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- document_registry.py'nin birebir karsiligi: document_id = "{competition}::{file_name}",
-- versiyonlama active/inactive + version increment, eski versiyon ASLA silinmez.
CREATE TABLE documents (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id      TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  competition      TEXT,
  category         TEXT,
  source_path      TEXT,  -- KV key (dosya bu key ile PIRI_DOCS_KV'de tutulur)
  version          INTEGER NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('active','inactive')),
  upload_date      TEXT NOT NULL DEFAULT (datetime('now')),
  doc_type         TEXT CHECK (doc_type IN ('sartname','kilavuz','sss') OR doc_type IS NULL),
  kaynak_adi       TEXT,
  gecerlilik_bitis TEXT,
  UNIQUE (document_id, version)
);
CREATE INDEX idx_documents_document_id ON documents(document_id);
CREATE INDEX idx_documents_competition ON documents(competition);
CREATE INDEX idx_documents_status ON documents(status);

-- local_ingest.py'nin Chroma metadata semasinin birebir karsiligi.
-- id = orijinal projedeki gibi md5(f"{rel_path}|{locator}|{idx}|v{version}")
-- ve ayni zamanda Vectorize'daki vector id'si.
CREATE TABLE document_chunks (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  version     INTEGER NOT NULL,
  competition TEXT,
  category    TEXT NOT NULL CHECK (category IN ('genel','sss','yarisma')),
  file_name   TEXT NOT NULL,
  file_type   TEXT,
  locator     TEXT,
  content     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('active','inactive')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_chunks_competition ON document_chunks(competition);
CREATE INDEX idx_chunks_status ON document_chunks(status);

-- BM25 lexical arama icin (rank_bm25'in D1-native karsiligi, FAZ 7'de
-- _hybrid_search'un RRF birlestirmesinde kullanilacak).
CREATE VIRTUAL TABLE document_chunks_fts USING fts5(
  content,
  content='document_chunks',
  content_rowid='rowid'
);
CREATE TRIGGER chunks_fts_insert AFTER INSERT ON document_chunks BEGIN
  INSERT INTO document_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER chunks_fts_delete AFTER DELETE ON document_chunks BEGIN
  INSERT INTO document_chunks_fts(document_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
CREATE TRIGGER chunks_fts_update AFTER UPDATE ON document_chunks BEGIN
  INSERT INTO document_chunks_fts(document_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO document_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- qa_log.py'nin qa_log.jsonl'inin birebir karsiligi.
CREATE TABLE qa_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL,
  competition TEXT,
  question    TEXT NOT NULL,
  answer      TEXT,
  status      TEXT NOT NULL CHECK (status IN (
                'answered','redirected','unrelated','out_of_scope',
                'technical_error','low_confidence','needs_competition','unclear'
              )),
  top_score   REAL,
  flagged     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_qa_log_status ON qa_log(status);
CREATE INDEX idx_qa_log_flagged ON qa_log(flagged);
CREATE INDEX idx_qa_log_timestamp ON qa_log(timestamp);

-- sss_store.py'nin sss_entries.jsonl'inin birebir karsiligi.
-- also_resolves JSON dizi olarak metin sutununda tutulur.
CREATE TABLE sss_entries (
  idx            INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp      TEXT NOT NULL,
  question       TEXT NOT NULL,
  answer         TEXT NOT NULL,
  competition    TEXT,
  category       TEXT,
  locator        TEXT,
  chunk_id       TEXT,
  author         TEXT,
  also_resolves  TEXT NOT NULL DEFAULT '[]'
);
