import hashlib
import sys
import time
from pathlib import Path

import chromadb
import torch
from tqdm import tqdm

from document_registry import ensure_registered
from local_chunking import chunk_blocks
from local_embed import embed_passages, get_model, get_tokenizer
from local_loaders import load_file

ROOT = Path("Piri-veriler")
PERSIST_DIR = "./chroma_db"
COLLECTION_NAME = "teknofest"
CHECKPOINT_FILE = Path("local_ingest_progress.txt")
SUPPORTED = {".docx", ".pdf", ".pptx", ".xlsx"}
SPECIAL_CATEGORIES = {
    "Genel ve Etik kuralar": "genel",
    "SSS": "sss",
}
EMBED_BATCH_SIZE = 32
DB_BATCH_SIZE = 256


def make_id(rel_path, locator, idx, version=1):
    """Versiyon numarasi id'ye dahildir: ayni dosyanin farkli versiyonlarinin
    chunk'lari cakismasin, eski versiyon Chroma'da silinmeden 'inactive'
    olarak saklanabilsin."""
    key = f"{rel_path}|{locator}|{idx}|v{version}"
    return hashlib.md5(key.encode("utf-8")).hexdigest()


def load_checkpoint():
    if not CHECKPOINT_FILE.exists():
        return set()
    return set(CHECKPOINT_FILE.read_text(encoding="utf-8").splitlines())


def append_checkpoint(ids):
    with CHECKPOINT_FILE.open("a", encoding="utf-8") as f:
        for i in ids:
            f.write(i + "\n")


def registry_category(competition):
    """Belge-kayit sistemindeki 'general' / 'competition_specific' ayrimi;
    Chroma metadata'sindaki 'category' (genel/sss/yarisma) alanindan bagimsizdir."""
    return "general" if competition in SPECIAL_CATEGORIES else "competition_specific"


def records_for_file(path, competition, tokenizer, version=1, status="active", document_id=None, root=ROOT):
    """Tek bir dosyayi parse edip chunk'layarak Chroma-hazir kayit listesi uretir.
    version/status/document_id, kaynak dogrulama+versiyon takibi icin metadata'ya eklenir."""
    category = SPECIAL_CATEGORIES.get(competition, "yarisma")
    rel_path = str(path.relative_to(root))
    blocks = load_file(path)
    if not blocks:
        return []
    chunks = chunk_blocks(blocks, tokenizer)
    return [
        {
            "id": make_id(rel_path, locator, idx, version=version),
            "text": text,
            "metadata": {
                "competition": competition,
                "category": category,
                "file": path.name,
                "file_type": path.suffix.lower().lstrip("."),
                "locator": locator or "",
                "source_path": rel_path,
                "document_id": document_id or f"{competition}::{path.name}",
                "version": version,
                "status": status,
            },
        }
        for idx, (text, locator) in enumerate(chunks)
    ]


def build_records(tokenizer):
    records = []
    file_count = 0
    for comp_dir in sorted(p for p in ROOT.iterdir() if p.is_dir()):
        competition = comp_dir.name
        for path in sorted(comp_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED:
                continue
            if path.name.startswith("~$"):
                continue
            rel_path = str(path.relative_to(ROOT))
            document_id, version = ensure_registered(
                competition, path.name, rel_path, category=registry_category(competition)
            )
            file_records = records_for_file(
                path, competition, tokenizer, version=version, status="active", document_id=document_id
            )
            if file_records:
                file_count += 1
                records.extend(file_records)
    return records, file_count


def get_collection():
    client = chromadb.PersistentClient(path=PERSIST_DIR)
    return client.get_or_create_collection(
        name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
    )


def ingest_records(records, collection, batch_size=DB_BATCH_SIZE, embed_batch_size=EMBED_BATCH_SIZE):
    """Verilen kayitlari embedleyip Chroma'ya yazar; islenen id'leri dondurur."""
    done_ids = load_checkpoint()
    remaining = [r for r in records if r["id"] not in done_ids]
    for start in range(0, len(remaining), batch_size):
        batch = remaining[start : start + batch_size]
        texts = [r["text"] for r in batch]
        vectors = embed_passages(texts, batch_size=embed_batch_size, show_progress_bar=False)
        collection.add(
            ids=[r["id"] for r in batch],
            embeddings=vectors.tolist(),
            documents=texts,
            metadatas=[r["metadata"] for r in batch],
        )
        append_checkpoint(r["id"] for r in batch)
    return remaining


def main():
    t_start = time.time()
    print("[1] Model yukleniyor (tokenizer icin)...")
    model = get_model()
    tokenizer = get_tokenizer()

    print("[2] Dokumanlar taraniyor ve parcalaniyor...")
    records, file_count = build_records(tokenizer)
    done_ids = load_checkpoint()
    remaining = [r for r in records if r["id"] not in done_ids]
    print(f"    {file_count} dosya, {len(records)} chunk toplam, "
          f"{len(done_ids)} zaten islenmis, {len(remaining)} kaldi.")

    client = chromadb.PersistentClient(path=PERSIST_DIR)
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
    )

    if not remaining:
        print("Yapilacak is yok, tum chunk'lar zaten islenmis.")
    else:
        print(f"[3] Embedding basliyor ({len(remaining)} chunk, batch_size={EMBED_BATCH_SIZE})...")
        for start in tqdm(range(0, len(remaining), DB_BATCH_SIZE), desc="DB batch"):
            batch = remaining[start : start + DB_BATCH_SIZE]
            texts = [r["text"] for r in batch]
            vectors = embed_passages(texts, batch_size=EMBED_BATCH_SIZE, show_progress_bar=False)
            collection.add(
                ids=[r["id"] for r in batch],
                embeddings=vectors.tolist(),
                documents=texts,
                metadatas=[r["metadata"] for r in batch],
            )
            append_checkpoint(r["id"] for r in batch)

    elapsed = time.time() - t_start
    device = "cuda" if torch.cuda.is_available() else "cpu"
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "-"
    total_in_db = collection.count()

    print("\n===== OZET =====")
    print(f"Islenen dosya sayisi   : {file_count}")
    print(f"Toplam chunk (tum arsiv): {len(records)}")
    print(f"Bu calistirmada islenen : {len(remaining)}")
    print(f"Chroma'daki toplam vektor: {total_in_db}")
    print(f"Sure                    : {elapsed/60:.1f} dakika")
    print(f"Cihaz                   : {device} ({gpu_name})")
    print(f"Kalici depo             : {PERSIST_DIR} (koleksiyon: {COLLECTION_NAME})")


if __name__ == "__main__":
    sys.exit(main())
