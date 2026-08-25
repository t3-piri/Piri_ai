"""Panelden yazilan SSS kayitlari.

Yanitsiz kalan bir soru yetkili tarafindan cevaplandiginda, cevap buraya
yazilir VE ayni anda vektor veritabanina islenir; boylece model ayni soru
tekrar geldiginde kaynakli yanit verebilir. Yani panel, bilgi tabanini
guncellemenin ikinci yoludur (belge yuklemenin yani sira).

Kayit iki yerde tutulur:
  - sss_entries.jsonl : insan tarafindan okunabilir kayit/gecmis
  - Chroma            : aramaya giren chunk (her kayit tek chunk)
"""

import json
import time
from pathlib import Path

from document_registry import ensure_registered
from local_ingest import get_collection, ingest_records, make_id

ENTRIES_FILE = Path("sss_entries.jsonl")

# Panelden eklenen kayitlarin kaynak havuzunda gorunecegi sanal belge adi.
SSS_FOLDER = "SSS"
VIRTUAL_FILE = "Destek Ekibi Yanıtları (Panel SSS)"


def list_entries():
    if not ENTRIES_FILE.exists():
        return []
    entries = []
    for line in ENTRIES_FILE.read_text(encoding="utf-8").splitlines():
        if line.strip():
            entries.append(json.loads(line))
    return entries


def resolved_questions():
    """Panelden cevaplanmis (ya da bir SSS kaydinin varyanti olarak isaretlenmis)
    sorularin metinleri - 'yanitsiz' listesinden dusmeleri icin."""
    resolved = set()
    for e in list_entries():
        if e.get("question"):
            resolved.add(e["question"])
        resolved.update(e.get("also_resolves") or [])
    return resolved


def _scope(competition):
    """Kayit hangi arama kapsamina girsin?
    competition None/'SSS' ise genel havuza (category='sss'), aksi halde
    ilgili yarismanin havuzuna (category='yarisma') yazilir - boylece
    local_rag_answer'daki genel/yarisma filtreleriyle birebir uyumlu olur."""
    if not competition or competition == SSS_FOLDER:
        return SSS_FOLDER, "sss", "general"
    return competition, "yarisma", "competition_specific"


def add_entry(question, answer, competition=None, author=None, also_resolves=None):
    """Soru-cevabi kalici kayda yazar ve Chroma'ya isler.

    also_resolves: sik-tekrarlanan-soru kumelemesinde ayni kumede cikan
    FARKLI ifadelerle sorulmus varyantlar (bkz. insights.frequent_unanswered).
    Bunlar icin AYRI bir Chroma parcasi OLUSTURULMAZ (ayni cevabi tekrar
    tekrar indekslemek gereksiz) - sadece 'yanitsiz sorular' listesinden
    dusmeleri icin isaretlenirler.

    Donus: (entry, eklenen_chunk_sayisi)"""
    question = (question or "").strip()
    answer = (answer or "").strip()
    if not question:
        raise ValueError("Soru boş olamaz.")
    if not answer:
        raise ValueError("Cevap boş olamaz.")
    also_resolves = [v.strip() for v in (also_resolves or []) if v and v.strip() and v.strip() != question]

    scope_competition, category, registry_cat = _scope(competition)
    index = len(list_entries()) + 1
    locator = f"SSS kaydı #{index}"
    rel_path = f"{scope_competition}/{VIRTUAL_FILE}"

    document_id, version = ensure_registered(
        scope_competition, VIRTUAL_FILE, rel_path, category=registry_cat
    )

    text = f"Soru: {question}\nCevap: {answer}"
    record = {
        "id": make_id(rel_path, locator, index, version=version),
        "text": text,
        "metadata": {
            "competition": scope_competition,
            "category": category,
            "file": VIRTUAL_FILE,
            "file_type": "sss",
            "locator": locator,
            "source_path": rel_path,
            "document_id": document_id,
            "version": version,
            "status": "active",
        },
    }
    added = ingest_records([record], get_collection())

    entry = {
        "index": index,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "question": question,
        "answer": answer,
        "competition": scope_competition,
        "category": category,
        "locator": locator,
        "chunk_id": record["id"],
        "author": author,
        "also_resolves": also_resolves,
    }
    with ENTRIES_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return entry, len(added)
