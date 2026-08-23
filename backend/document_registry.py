import sqlite3
import time
from pathlib import Path

DB_FILE = Path("documents.db")


def _connect():
    conn = sqlite3.connect(DB_FILE)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            competition TEXT,
            category TEXT NOT NULL,
            source_path TEXT NOT NULL,
            version INTEGER NOT NULL,
            status TEXT NOT NULL,
            upload_date TEXT NOT NULL
        )
        """
    )
    return conn


def make_document_id(competition, file_name):
    return f"{competition or 'genel'}::{file_name}"


def _rows_to_dicts(cursor, rows):
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, row)) for row in rows]


def ensure_registered(competition, file_name, source_path, category="competition_specific"):
    """Ilk/toplu yukleme icin: document_id hic yoksa version=1/active olarak
    kaydeder; zaten kayitliysa dokunmaz. Surum atlamali (versioned) bir
    guncelleme degildir - bunun icin register_new_version kullanilir."""
    document_id = make_document_id(competition, file_name)
    conn = _connect()
    try:
        cur = conn.execute("SELECT 1 FROM documents WHERE document_id = ? LIMIT 1", (document_id,))
        if cur.fetchone() is None:
            conn.execute(
                """INSERT INTO documents
                   (document_id, file_name, competition, category, source_path, version, status, upload_date)
                   VALUES (?, ?, ?, ?, ?, 1, 'active', ?)""",
                (document_id, file_name, competition, category, source_path, time.strftime("%Y-%m-%d")),
            )
            conn.commit()
        return document_id, 1
    finally:
        conn.close()


def register_new_version(competition, file_name, source_path, category="competition_specific"):
    """Ayni document_id'ye ait mevcut 'active' versiyonu 'inactive' yapar,
    yeni versiyonu 'active' olarak ekler. Dondurulen (document_id, version)
    ingest sirasinda chunk id'lerine gomulur (versiyonlar arasi id
    çakışmasını önlemek için); eski versiyonun chunk'lari SILINMEZ, sadece
    Chroma'daki metadata'lari 'inactive' olarak guncellenir."""
    document_id = make_document_id(competition, file_name)
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT MAX(version) FROM documents WHERE document_id = ?", (document_id,)
        )
        max_version = cur.fetchone()[0]
        new_version = (max_version or 0) + 1

        conn.execute(
            "UPDATE documents SET status = 'inactive' WHERE document_id = ? AND status = 'active'",
            (document_id,),
        )
        conn.execute(
            """INSERT INTO documents
               (document_id, file_name, competition, category, source_path, version, status, upload_date)
               VALUES (?, ?, ?, ?, ?, ?, 'active', ?)""",
            (document_id, file_name, competition, category, source_path, new_version, time.strftime("%Y-%m-%d")),
        )
        conn.commit()
        return document_id, new_version
    finally:
        conn.close()


def get_active_version(competition, file_name):
    document_id = make_document_id(competition, file_name)
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT version FROM documents WHERE document_id = ? AND status = 'active'", (document_id,)
        )
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def list_documents(competition=None):
    conn = _connect()
    try:
        if competition:
            cur = conn.execute(
                "SELECT * FROM documents WHERE competition = ? ORDER BY document_id, version", (competition,)
            )
        else:
            cur = conn.execute("SELECT * FROM documents ORDER BY document_id, version")
        return _rows_to_dicts(cur, cur.fetchall())
    finally:
        conn.close()


def set_status(document_id, version, status):
    conn = _connect()
    try:
        conn.execute(
            "UPDATE documents SET status = ? WHERE document_id = ? AND version = ?",
            (status, document_id, version),
        )
        conn.commit()
    finally:
        conn.close()


def deactivate_all_versions(document_id):
    conn = _connect()
    try:
        conn.execute("UPDATE documents SET status = 'inactive' WHERE document_id = ?", (document_id,))
        conn.commit()
    finally:
        conn.close()
