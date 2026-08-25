#!/bin/sh
# Railway mounts the persistent volume at /data. It starts empty, which
# would hide /app's baked-in files if the volume were mounted there
# instead - so code stays under /app (rebuilt fresh on every deploy) and
# only the mutable/generated state (Piri-veriler copy, chroma_db, the
# SQLite DBs, logs) lives under /data across restarts and redeploys.
set -e

mkdir -p /data

if [ ! -d /data/Piri-veriler ]; then
    echo "[entrypoint] Piri-veriler ilk kez /data'ya kopyalaniyor..."
    cp -r /app/Piri-veriler-seed /data/Piri-veriler
fi

cd /data

if [ ! -d chroma_db ]; then
    echo "[entrypoint] chroma_db bulunamadi, ilk indeksleme calistiriliyor..."
    python /app/backend/local_ingest.py
fi

exec python /app/backend/web_app.py
