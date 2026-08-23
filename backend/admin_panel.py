"""Terminal yonetim araci.

Web panelindeki (web_app.py) ayni rol/yetki modelini kullanir: giris kullanici
adi + sifre ile yapilir, menude yalnizca rolun izin verdigi islemler gorunur.
Kullanicilar ve roller icin bkz. users.py.
"""

import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

import sss_store
import users as user_store
from competitions import ROOT, list_competitions, list_real_competitions
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
from qa_log import read_log, unanswered_questions

load_dotenv()

# Giris yapan kullanici (main icinde doldurulur)
CURRENT = None


def _can(permission):
    return CURRENT is not None and user_store.has_permission(CURRENT["role"], permission)


def _warn_server():
    """CLI ayri bir surecte calisir; acik bir web sunucusunun bellekteki BM25
    indeksi bu degisiklikten haberdar olmaz."""
    print("  ! Web sunucusu aciksa, lexical arama indeksinin tazelenmesi icin "
          "sunucuyu yeniden baslatin.")


def login():
    """users.db bosken .env'deki bilgilerle sahip hesabini olusturur."""
    created = user_store.ensure_owner()
    if created:
        print(f"Sahip hesabi olusturuldu: '{created}' (sifre: .env ADMIN_PASSWORD)\n")

    # Not: getpass() bazi terminal/IDE konsollarinda girdi kabul etmedigi icin
    # bilincli olarak input() kullaniliyor - sifre ekranda gorunur.
    username = input("Kullanici adi: ").strip()
    password = input("Sifre: ").strip()

    user = user_store.verify(username, password)
    if user is None:
        sys.exit("Kullanici adi veya sifre hatali. Cikiliyor.")
    return user


# --------------------------------------------------------------- kaynaklar

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
    _warn_server()


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

    if input(f"'{rel_path}' kalıcı olarak silinecek. Onaylıyor musunuz? [e/H]: ").strip().lower() != "e":
        print("İptal edildi.")
        return

    collection = get_collection()
    collection.delete(where={"source_path": rel_path})
    target_file.unlink()
    deactivate_all_versions(make_document_id(competition, target_file.name))
    print(f"Silindi: {rel_path}")
    _warn_server()


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
    if not _can("sources.status"):
        print("\n(Durum değiştirme yetkiniz yok — yalnızca görüntüleme.)")
        return

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
    _warn_server()


# ------------------------------------------------------------------ sorular

def _pending_questions():
    """Panelden henuz cevaplanmamis, kanit yetersizligi nedeniyle yonlendirilen sorular."""
    resolved = sss_store.resolved_questions()
    return [e for e in unanswered_questions() if e["question"] not in resolved]


def list_unresolved():
    log = read_log()
    pending = _pending_questions()
    entries = sss_store.list_entries()
    print(f"\nToplam soru: {len(log)} | Bekleyen: {len(pending)} | Panelden işlenen: {len(entries)}")
    if not pending:
        print("Bekleyen soru yok.")
        return
    for i, e in enumerate(pending, start=1):
        print(f"  [{i}] [{e['timestamp']}] {e['competition']} -> {e['question']}")


def answer_question():
    """Yanitsiz bir soruyu cevaplar; cevap SSS kaydi olarak vektor veritabanina
    islenir, boylece model ayni soruyu bundan sonra kaynak gostererek yanitlar."""
    pending = _pending_questions()
    if not pending:
        print("Bekleyen soru yok.")
        return
    for i, e in enumerate(pending, start=1):
        print(f"  [{i}] {e['question']}   ({e['competition']})")

    choice = input("Yanıtlanacak soru numarası: ").strip()
    if not (choice.isdigit() and 1 <= int(choice) <= len(pending)):
        print("Geçersiz seçim.")
        return
    entry = pending[int(choice) - 1]

    print(f"\nSoru: {entry['question']}")
    answer = input("Cevap (doğrulanmış, kısa): ").strip()
    if not answer:
        print("Boş cevap, iptal edildi.")
        return

    print("\nBu cevap hangi kapsama yazılsın?")
    print("  [0] Genel Kurallar / SSS (tüm yarışmalar)")
    comps = list_real_competitions()
    default = entry.get("competition") if entry.get("competition") in comps else None
    for i, c in enumerate(comps, start=1):
        print(f"  [{i}] {c}" + ("   <- sorunun bağlamı" if c == default else ""))
    scope = input("Numara (boş = 0): ").strip()
    competition = None
    if scope.isdigit() and 1 <= int(scope) <= len(comps):
        competition = comps[int(scope) - 1]

    try:
        saved, added = sss_store.add_entry(
            entry["question"], answer, competition=competition, author=CURRENT["username"]
        )
    except ValueError as e:
        print(f"Kaydedilemedi: {e}")
        return

    print(f"Kaydedildi: {saved['locator']} | kapsam: {saved['competition']} | "
          f"vektör veritabanına işlenen parça: {added}")
    _warn_server()


# ------------------------------------------------------------- kullanicilar

def list_users():
    for u in user_store.list_users():
        marker = " (siz)" if u["username"] == CURRENT["username"] else ""
        print(f"  @{u['username']}{marker} | {u['display_name']} | {u['role_label']} | "
              f"oluşturma: {u['created_at']} | son giriş: {u['last_login'] or '—'}")


def manage_users():
    print("\n  [1] Kullanıcı ekle")
    print("  [2] Rol değiştir")
    print("  [3] Şifre sıfırla")
    print("  [4] Kullanıcı sil")
    print("  [5] Sahipliği devret" + ("" if CURRENT["role"] == user_store.OWNER_ROLE else "  (yalnızca sahip)"))
    action = input("Seçim: ").strip()

    roles = [r for r in user_store.roles_catalog() if r["assignable"]]

    def pick_role():
        for i, r in enumerate(roles, start=1):
            print(f"  [{i}] {r['label']} — {r['description']}")
        c = input("Rol numarası: ").strip()
        return roles[int(c) - 1]["key"] if (c.isdigit() and 1 <= int(c) <= len(roles)) else None

    def pick_user(exclude_self=True, exclude_owner=True):
        candidates = [
            u for u in user_store.list_users()
            if not (exclude_self and u["username"] == CURRENT["username"])
            and not (exclude_owner and u["role"] == user_store.OWNER_ROLE)
        ]
        if not candidates:
            print("Uygun kullanıcı yok.")
            return None
        for i, u in enumerate(candidates, start=1):
            print(f"  [{i}] @{u['username']} ({u['role_label']})")
        c = input("Kullanıcı numarası: ").strip()
        return candidates[int(c) - 1]["username"] if (c.isdigit() and 1 <= int(c) <= len(candidates)) else None

    try:
        if action == "1":
            username = input("Kullanıcı adı (boşluksuz): ").strip()
            display = input("Görünen ad: ").strip()
            password = input("Şifre (en az 4 karakter): ").strip()
            role = pick_role()
            if not role:
                print("Geçersiz rol, iptal edildi.")
                return
            created = user_store.create_user(
                username, password, role, display_name=display or None,
                created_by=CURRENT["username"],
            )
            print(f"Oluşturuldu: @{created['username']} ({created['role_label']})")

        elif action == "2":
            username = pick_user()
            if not username:
                return
            role = pick_role()
            if not role:
                print("Geçersiz rol, iptal edildi.")
                return
            updated = user_store.set_role(username, role)
            print(f"@{username} -> {updated['role_label']}")

        elif action == "3":
            username = pick_user()
            if not username:
                return
            user_store.set_password(username, input("Yeni şifre: ").strip())
            print("Şifre güncellendi.")

        elif action == "4":
            username = pick_user()
            if not username:
                return
            if input(f"@{username} silinecek. Onaylıyor musunuz? [e/H]: ").strip().lower() != "e":
                print("İptal edildi.")
                return
            user_store.delete_user(username)
            print("Silindi.")

        elif action == "5":
            if CURRENT["role"] != user_store.OWNER_ROLE:
                print("Bu işlemi yalnızca sahip yapabilir.")
                return
            username = pick_user()
            if not username:
                return
            if input(f"Sahiplik @{username} hesabına devredilecek, siz Yönetici olacaksınız. "
                     "Onaylıyor musunuz? [e/H]: ").strip().lower() != "e":
                print("İptal edildi.")
                return
            user_store.transfer_ownership(CURRENT["username"], username)
            print(f"Sahiplik @{username} hesabına devredildi. Yeni rolünüz için tekrar giriş yapın.")
            sys.exit(0)

        else:
            print("Geçersiz seçim.")

    except user_store.UserError as e:
        print(f"İşlem yapılamadı: {e}")


# ------------------------------------------------------------------- menu

# (etiket, gereken yetki, fonksiyon)
ACTIONS = [
    ("Yeni yarışma/kategori ekle", "sources.upload", add_competition),
    ("Kaynak dosyası yükle/güncelle", "sources.upload", upload_or_update_source),
    ("Kaynak dosyası sil", "sources.delete", delete_source),
    ("Kaynak kayıtlarını (sürüm/durum) görüntüle/düzenle", "sources.view", view_edit_registry),
    ("Bekleyen (yanıtsız) soruları listele", "questions.view", list_unresolved),
    ("Bekleyen soruyu yanıtla ve SSS'e işle", "questions.answer", answer_question),
    ("Kullanıcıları listele", "users.view", list_users),
    ("Kullanıcı/rol yönetimi", "users.manage", manage_users),
]


def main():
    global CURRENT
    CURRENT = login()
    print(f"\nGiriş başarılı: {CURRENT['display_name']} ({CURRENT['role_label']})")

    allowed = [(label, fn) for label, perm, fn in ACTIONS if _can(perm)]
    if not allowed:
        sys.exit("Rolünüzün bu araçta kullanabileceği bir işlem yok.")

    while True:
        print("\n" + "-" * 58)
        for i, (label, _) in enumerate(allowed, start=1):
            print(f"[{i}] {label}")
        print("[0] Çıkış")

        choice = input("Seçim: ").strip()
        if choice == "0":
            break
        if choice.isdigit() and 1 <= int(choice) <= len(allowed):
            allowed[int(choice) - 1][1]()
        else:
            print("Geçersiz seçim.")


if __name__ == "__main__":
    main()
