-- Yarismacinin bir yanitin altinda bildirdigi begen/begenme (thumbs up/down)
-- geri bildirimi. qa_log.id (D1'in dogal auto-increment rowid'i) ile
-- eslesir - backend/qa_log.py'nin ayri qa_feedback.jsonl dosyasinin D1
-- karsiligi.
CREATE TABLE IF NOT EXISTS qa_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER NOT NULL,
  satisfaction TEXT NOT NULL CHECK (satisfaction IN ('up', 'down')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qa_feedback_log_id ON qa_feedback (log_id);
