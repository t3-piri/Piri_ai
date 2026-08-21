"""Tek seferlik gocmen betigi: local_ingest.py'nin ilk calistirmasinda
(versiyon/durum takibi eklenmeden once) yuklenen chunk'lari geriye donuk
olarak document_id/version=1/status=active ile etiketler ve documents.db'ye
kaydeder. Zaten etiketlenmis chunk'lari atlar, guvenle tekrar calistirilabilir."""

from document_registry import ensure_registered
from local_ingest import get_collection, registry_category

BATCH_SIZE = 256


def main():
    collection = get_collection()
    all_data = collection.get(include=["metadatas"])
    ids = all_data["ids"]
    metadatas = all_data["metadatas"]
    print(f"Chroma'da {len(ids)} chunk bulundu.")

    seen_docs = set()
    to_update_ids = []
    to_update_metas = []

    for cid, meta in zip(ids, metadatas):
        if meta.get("status"):
            continue  # zaten etiketlenmis

        competition = meta.get("competition")
        file_name = meta.get("file")
        source_path = meta.get("source_path")
        doc_key = (competition, file_name)
        if doc_key not in seen_docs:
            seen_docs.add(doc_key)
            document_id, version = ensure_registered(
                competition, file_name, source_path, category=registry_category(competition)
            )
        else:
            document_id = f"{competition}::{file_name}"
            version = 1

        new_meta = dict(meta)
        new_meta["document_id"] = document_id
        new_meta["version"] = version
        new_meta["status"] = "active"
        to_update_ids.append(cid)
        to_update_metas.append(new_meta)

    print(f"{len(to_update_ids)} chunk guncellenecek, {len(seen_docs)} benzersiz belge documents.db'ye kaydedildi.")

    for start in range(0, len(to_update_ids), BATCH_SIZE):
        batch_ids = to_update_ids[start : start + BATCH_SIZE]
        batch_metas = to_update_metas[start : start + BATCH_SIZE]
        collection.update(ids=batch_ids, metadatas=batch_metas)
        print(f"  {min(start + BATCH_SIZE, len(to_update_ids))}/{len(to_update_ids)} guncellendi")

    print("Tamamlandi.")


if __name__ == "__main__":
    main()
