import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

from competitions import ROOT, list_competitions
from document_registry import (
    deactivate_all_versions,
    list_documents,
    make_document_id,
    register_new_version,
    set_status,
)
from local_ingest import (
    get_collection,
    get_tokenizer,
    ingest_records,
    records_for_file,
    registry_category,
)
from qa_log import unresolved_entries

load_dotenv()


def require_admin():
    expected = os.environ.get("ADMIN_PASSWORD")
    if not expected:
        sys.exit(
            "ADMIN_PASSWORD .env dosyasinda tanimli degil. Admin paneli guvenlik "
            "nedeniyle bir sifre tanimlanmadan calismaz."
        )
    entered = input("Admin sifresi: ").strip()
    if entered != expected:
        sys.exit("Sifre yanlis. Cikiliyor.")


def add_competition():
    name = input("Yeni yarışma/kategori adı: ").strip()
    if not name:
        print("Boş isim, iptal edildi.")
        return
    path = ROOT / name
    if path.exists():
        print("Bu isimde bir klasör zaten var.")
        return
    path.mkdir(parents=True)
    print(f"'{name}' oluşturuldu: {path}")


def _pick_competition():
    comps = list_competitions()
    for i, c in enumerate(comps, start=1):
        print(f"  [{i}] {c}")
    choice = input("Yarışma numarası (veya yeni ad yazın): ").strip()
    if choice.isdigit() and 1 <= int(choice) <= len(comps):
        return comps[int(choice) - 1]
    return choice


def upload_or_update_source():
    competition = _pick_competition()
    target_dir = ROOT / competition
    target_dir.mkdir(parents=True, exist_ok=True)

    src = input("Yüklenecek/güncellenecek dosyanın tam yolu: ").strip().strip('"')
    src_path = Path(src)
    if not src_path.exists():
        print("Dosya bulunamadı.")
        return
    if src_path.suffix.lower() not in (".docx", ".pdf", ".pptx", ".xlsx"):
        print("Desteklenmeyen dosya türü.")
        return

    dest_path = target_dir / src_path.name
    rel_path = str(dest_path.relative_to(ROOT))
    is_update = dest_path.exists()

    collection = get_collection()
    if is_update:
        # Eski versiyonu SILME, sadece Chroma'daki metadata'sini 'inactive' yap
        # (gecmis kayit olarak dursun, arama sonuclarina dahil edilmesin).
        old = collection.get(
            where={"$and": [{"source_path": rel_path}, {"status": "active"}]},
            include=["metadatas"],
        )
        if old["ids"]:
            updated_metas = [{**m, "status": "inactive"} for m in old["metadatas"]]
            collection.update(ids=old["ids"], metadatas=updated_metas)
        print(f"Eski versiyon pasif hale getirildi ({len(old['ids'])} chunk), yeni versiyon yükleniyor...")

    shutil.copy2(src_path, dest_path)

    document_id, version = register_new_version(
        competition, src_path.name, rel_path, category=registry_category(competition)
    )
    tokenizer = get_tokenizer()
    records = records_for_file(
        dest_path, competition, tokenizer, version=version, status="active", document_id=document_id
    )
    ingest_records(records, collection)

    print(f"{'Güncellendi' if is_update else 'Yüklendi'}: {rel_path} (v{version}, {len(records)} chunk)")


def delete_source():
    competition = _pick_competition()
    target_dir = ROOT / competition
    if not target_dir.exists():
        print("Klasör bulunamadı.")
        return
    files = [p for p in target_dir.iterdir() if p.is_file()]
    for i, f in enumerate(files, start=1):
        print(f"  [{i}] {f.name}")
    choice = input("Silinecek dosya numarası: ").strip()
    if not (choice.isdigit() and 1 <= int(choice) <= len(files)):
        print("Geçersiz seçim.")
        return
    target_file = files[int(choice) - 1]
    rel_path = str(target_file.relative_to(ROOT))

    collection = get_collection()
    collection.delete(where={"source_path": rel_path})
    target_file.unlink()
    deactivate_all_versions(make_document_id(competition, target_file.name))
    print(f"Silindi: {rel_path}")


def list_unresolved():
    entries = unresolved_entries()
    if not entries:
        print("Yönlendirilmiş veya yanıtsız soru yok.")
        return
    for e in entries:
        print(f"[{e['timestamp']}] ({e['status']}) {e['competition']} -> {e['question']}")
        print(f"    Yanıt: {e['answer']}")


def view_edit_registry():
    docs = list_documents()
    if not docs:
        print("Kayıt defteri boş.")
        return
    for i, d in enumerate(docs, start=1):
        print(
            f"  [{i}] {d['file_name']} | {d['competition']} | v{d['version']} | "
            f"{d['status']} | yüklendi: {d['upload_date']}"
        )
    choice = input("Durumunu değiştirmek istediğiniz numara (boş bırak = çıkış): ").strip()
    if not choice.isdigit():
        return
    idx = int(choice) - 1
    if not (0 <= idx < len(docs)):
        print("Geçersiz seçim.")
        return
    d = docs[idx]
    new_status = input(f"Yeni durum [active/inactive] (şu an: {d['status']}): ").strip().lower()
    if new_status not in ("active", "inactive"):
        print("Geçersiz durum, iptal edildi.")
        return
    set_status(d["document_id"], d["version"], new_status)
    collection = get_collection()
    matching = collection.get(
        where={"$and": [{"document_id": d["document_id"]}, {"version": d["version"]}]},
        include=["metadatas"],
    )
    if matching["ids"]:
        updated_metas = [{**m, "status": new_status} for m in matching["metadatas"]]
        collection.update(ids=matching["ids"], metadatas=updated_metas)
    print(f"Güncellendi: {d['file_name']} v{d['version']} -> {new_status} ({len(matching['ids'])} chunk)")


MENU = """
[1] Yeni yarışma/kategori ekle
[2] Kaynak dosyası yükle/güncelle
[3] Kaynak dosyası sil
[4] Yönlendirilen/yanıtsız soruları listele
[5] Kaynak kayıtlarını (versiyon/durum) görüntüle/düzenle
[0] Çıkış
"""


def main():
    require_admin()
    print("Admin girişi başarılı.")
    actions = {
        "1": add_competition,
        "2": upload_or_update_source,
        "3": delete_source,
        "4": list_unresolved,
        "5": view_edit_registry,
    }
    while True:
        print(MENU)
        choice = input("Seçim: ").strip()
        if choice == "0":
            break
        action = actions.get(choice)
        if action:
            action()
        else:
            print("Geçersiz seçim.")


if __name__ == "__main__":
    main()
