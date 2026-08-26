-- BM25 (FTS5) icin Turkce karakter katlama destegi. Orijinal
-- local_rag_answer.py'deki _tokenize()/_TR_FOLD davranisinin (ceviri
-- tablosu: cgiosu <- cgıöşü) D1 tarafi karsiligi: FTS5'in kendi
-- unicode61 tokenizer'i Turkce'ye ozgu harfleri (ı/ğ/ş) katlamiyor, bu
-- yuzden ayri, onceden katlanmis bir kolon indeksleniyor.

ALTER TABLE document_chunks ADD COLUMN content_folded TEXT NOT NULL DEFAULT '';

DROP TRIGGER chunks_fts_insert;
DROP TRIGGER chunks_fts_delete;
DROP TRIGGER chunks_fts_update;
DROP TABLE document_chunks_fts;

CREATE VIRTUAL TABLE document_chunks_fts USING fts5(
  content_folded,
  content='document_chunks',
  content_rowid='rowid'
);
CREATE TRIGGER chunks_fts_insert AFTER INSERT ON document_chunks BEGIN
  INSERT INTO document_chunks_fts(rowid, content_folded) VALUES (new.rowid, new.content_folded);
END;
CREATE TRIGGER chunks_fts_delete AFTER DELETE ON document_chunks BEGIN
  INSERT INTO document_chunks_fts(document_chunks_fts, rowid, content_folded) VALUES ('delete', old.rowid, old.content_folded);
END;
CREATE TRIGGER chunks_fts_update AFTER UPDATE ON document_chunks BEGIN
  INSERT INTO document_chunks_fts(document_chunks_fts, rowid, content_folded) VALUES ('delete', old.rowid, old.content_folded);
  INSERT INTO document_chunks_fts(rowid, content_folded) VALUES (new.rowid, new.content_folded);
END;
