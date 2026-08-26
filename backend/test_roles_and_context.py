r"""Rol bazli yetkilendirme + baglam secimli arama + yanitsiz soru -> SSS akisi testi.

Calisan bir sunucu gerektirir (komutlar proje kok dizininden calistirilir):
    $env:PIRI_PORT="8100"; .\.venv-local\Scripts\python.exe backend\web_app.py
sonra:
    .\.venv-local\Scripts\python.exe backend\test_roles_and_context.py
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = f"http://127.0.0.1:{os.environ.get('PIRI_PORT', '8100')}"
OWNER_USER = os.environ.get("OWNER_USERNAME", "sahip")
OWNER_PW = os.environ.get("ADMIN_PASSWORD", "admin123")

TEST_USERS = ["t_sistem", "t_icerik", "t_destek"]
TEST_QUESTION = "PIRI-TEST: Panelden eklenen bu kaydin sorusu nedir?"
TEST_ANSWER = "PIRI-TEST: Bu, panel uzerinden eklenmis dogrulanmis bir SSS kaydidir."

passed, failed = [], []


def call(method, path, body=None, token=None, expect=200):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def check(name, condition, detail=""):
    (passed if condition else failed).append(name)
    print(f"  [{'OK ' if condition else 'HATA'}] {name}" + (f" -> {detail}" if detail and not condition else ""))


def login(username, password, expect_ok=True):
    status, data = call("POST", "/api/admin/login", {"username": username, "password": password})
    if expect_ok:
        return data.get("token"), data.get("user")
    return status, data


# --------------------------------------------------------------- 1) baglam
print("\n[1] Yarismaci arayuzu - baglam secimi (giris gerektirmez)")
status, ctx = call("GET", "/api/contexts")
check("GET /api/contexts 200", status == 200, str(status))
general_label = ctx.get("general_label", "")
comps = ctx.get("competitions", [])
check("Genel baglam etiketi geliyor", bool(general_label), general_label)
check("Yarisma listesi dolu", len(comps) > 10, f"{len(comps)} yarisma")

status, _ = call("POST", "/api/ask", {"question": "test", "context": "Olmayan Yarisma"})
check("Gecersiz baglam 400 doner", status == 400, str(status))

status, res = call("POST", "/api/ask", {
    "question": "Etik kurallara aykiri davranisin yaptirimi nedir?",
    "context": general_label,
})
check("Genel baglamda yanit uretildi", status == 200 and res["status"] == "answered",
      f"{status} / {res.get('status')}")
if res.get("sources"):
    check("Genel yanit kaynak gosteriyor", len(res["sources"]) > 0, "kaynak yok")

target_comp = next((c for c in comps if "Roket" in c), comps[0])
status, res2 = call("POST", "/api/ask", {
    "question": "Takimda kac kisi olabilir?", "context": target_comp,
})
check(f"Yarisma baglaminda ({target_comp[:28]}...) yanit uretildi",
      status == 200 and res2["status"] in ("answered", "low_confidence"),
      f"{status} / {res2.get('status')}")
if res2.get("sources"):
    off = [s for s in res2["sources"] if s["competition"] not in (target_comp, "SSS", "Genel ve Etik kuralar")]
    check("Yanit yalnizca secili baglamin/genelin kaynaklarindan", not off,
          f"kapsam disi: {[s['competition'] for s in off][:3]}")

# --------------------------------------------------------------- 2) oturum
print("\n[2] Yonetim paneli - kimlik dogrulama")
status, _ = login("sahip", "yanlis-sifre", expect_ok=False)
check("Yanlis sifre 401", status == 401, str(status))

owner_token, owner = login(OWNER_USER, OWNER_PW)
check("Sahip girisi basarili", bool(owner_token))
if not owner_token:
    print("\nSahip girisi yapilamadi, test durduruldu.")
    sys.exit(1)
check("Sahip rolu 'sahip'", owner["role"] == "sahip", owner.get("role"))
check("Sahip tum yetkilere sahip", len(owner["permissions"]) == 9, str(len(owner["permissions"])))

status, _ = call("GET", "/api/admin/documents")
check("Tokensiz istek 401", status == 401, str(status))

# ------------------------------------------------------- 3) kullanici/rol
print("\n[3] Kullanici olusturma ve rol yetkileri")
for u in TEST_USERS:
    call("POST", "/api/admin/users/delete", {"username": u}, token=owner_token)

status, _ = call("POST", "/api/admin/users",
                 {"username": "t_sistem", "password": "test1234", "role": "sistem_yoneticisi",
                  "display_name": "Test Sistem Yoneticisi"}, token=owner_token)
check("Sistem Yoneticisi hesabi olusturuldu", status == 200, str(status))

status, data = call("POST", "/api/admin/users",
                    {"username": "t_sahip2", "password": "test1234", "role": "sahip"},
                    token=owner_token)
check("Ikinci sahip olusturulamaz", status == 400, f"{status} {data.get('detail','')}")

status, _ = call("POST", "/api/admin/users",
                 {"username": "t_icerik", "password": "test1234", "role": "icerik_yoneticisi",
                  "display_name": "Test Icerik Yoneticisi"}, token=owner_token)
check("Icerik Yoneticisi hesabi olusturuldu", status == 200, str(status))

status, _ = call("POST", "/api/admin/users",
                 {"username": "t_destek", "password": "test1234", "role": "destek_ekibi",
                  "display_name": "Test Destek Ekibi"}, token=owner_token)
check("Destek Ekibi hesabi olusturuldu", status == 200, str(status))

sistem_token, sistem = login("t_sistem", "test1234")
check("Sistem Yoneticisi girisi", bool(sistem_token))
check("Sistem Yoneticisi 1 yetkiye sahip", sistem and len(sistem["permissions"]) == 1,
      str(sistem and sistem["permissions"]))

status, _ = call("GET", "/api/admin/documents", token=sistem_token)
check("Sistem Yoneticisi kaynaklari GOREMEZ (403)", status == 403, str(status))
status, _ = call("GET", "/api/admin/unanswered", token=sistem_token)
check("Sistem Yoneticisi yanit kalitesi/yonlendirme metriklerini GOREBILIR", status == 200, str(status))
status, _ = call("GET", "/api/admin/activity", token=sistem_token)
check("Sistem Yoneticisi etkinlik takvimini GOREBILIR", status == 200, str(status))
status, _ = call("POST", "/api/admin/documents/status",
                 {"document_id": "x", "version": 1, "status": "inactive"}, token=sistem_token)
check("Sistem Yoneticisi durum DEGISTIREMEZ (403)", status == 403, str(status))
status, _ = call("GET", "/api/admin/users", token=sistem_token)
check("Sistem Yoneticisi kullanicilari GOREMEZ (403)", status == 403, str(status))
status, _ = call("POST", "/api/admin/questions/answer",
                 {"question": "x", "answer": "y"}, token=sistem_token)
check("Sistem Yoneticisi soru YANITLAYAMAZ (403)", status == 403, str(status))

icerik_token, icerik = login("t_icerik", "test1234")
check("Icerik Yoneticisi girisi", bool(icerik_token))
check("Icerik Yoneticisi 3 yetkiye sahip", icerik and len(icerik["permissions"]) == 3,
      str(icerik and icerik["permissions"]))
status, _ = call("POST", "/api/admin/documents/status",
                 {"document_id": "x", "version": 1, "status": "inactive"}, token=icerik_token)
check("Icerik Yoneticisi durum DEGISTIREBILIR (yetkisi var)", status == 200, str(status))
status, _ = call("POST", "/api/admin/documents/delete", {"document_id": "x"}, token=icerik_token)
check("Icerik Yoneticisi belge SILEMEZ (403)", status == 403, str(status))
status, _ = call("POST", "/api/admin/questions/answer",
                 {"question": "x", "answer": "y"}, token=icerik_token)
check("Icerik Yoneticisi soru YANITLAYAMAZ (403)", status == 403, str(status))
status, _ = call("POST", "/api/admin/users", {"username": "z", "password": "1234", "role": "sistem_yoneticisi"},
                 token=icerik_token)
check("Icerik Yoneticisi kullanici EKLEYEMEZ (403)", status == 403, str(status))
status, _ = call("POST", "/api/admin/users/transfer", {"username": "t_sistem"}, token=icerik_token)
check("Icerik Yoneticisi sahiplik DEVREDEMEZ (403)", status == 403, str(status))

destek_token, destek = login("t_destek", "test1234")
check("Destek Ekibi girisi", bool(destek_token))
check("Destek Ekibi 2 yetkiye sahip", destek and len(destek["permissions"]) == 2,
      str(destek and destek["permissions"]))
status, _ = call("POST", "/api/admin/documents/status",
                 {"document_id": "x", "version": 1, "status": "inactive"}, token=destek_token)
check("Destek Ekibi kaynak durumu DEGISTIREMEZ (403)", status == 403, str(status))
status, _ = call("GET", "/api/admin/documents", token=destek_token)
check("Destek Ekibi kaynaklari GOREMEZ (403)", status == 403, str(status))

status, _ = call("POST", "/api/admin/users/role", {"username": "t_sistem", "role": "icerik_yoneticisi"},
                 token=owner_token)
check("Sahip rol degistirebilir", status == 200, str(status))
status, data = call("POST", "/api/admin/users/role", {"username": OWNER_USER, "role": "destek_ekibi"},
                    token=owner_token)
check("Sahip kendi rolunu degistiremez", status == 400, f"{status} {data.get('detail','')}")

# ------------------------------------------ 4) yanitsiz soru -> SSS -> model
print("\n[4] Yanitsiz soru -> SSS kaydi -> modelin ogrenmesi")
status, before = call("POST", "/api/ask", {"question": TEST_QUESTION, "context": general_label})
check("Bilinmeyen soru once yanitsiz kaliyor", before.get("status") == "low_confidence",
      before.get("status"))

status, un1 = call("GET", "/api/admin/unanswered", token=owner_token)
check("Yanitsiz listesinde gorunuyor",
      any(e["question"] == TEST_QUESTION for e in un1["unanswered"]), "listede yok")

status, ans = call("POST", "/api/admin/questions/answer",
                   {"question": TEST_QUESTION, "answer": TEST_ANSWER, "competition": None},
                   token=destek_token)
check("Destek Ekibi soruyu yanitlayip SSS'e isleyebilir", status == 200, str(status))
check("Cevap vektor veritabanina islendi", ans.get("indexed_chunks", 0) == 1,
      str(ans.get("indexed_chunks")))

status, un2 = call("GET", "/api/admin/unanswered", token=owner_token)
check("Soru yanitsiz listesinden dustu",
      not any(e["question"] == TEST_QUESTION for e in un2["unanswered"]), "hala listede")
check("SSS kaydi listeleniyor",
      any(e["question"] == TEST_QUESTION for e in un2["sss_entries"]), "kayit yok")

status, after = call("POST", "/api/ask", {"question": TEST_QUESTION, "context": general_label})
check("Model artik ayni soruyu yanitliyor", after.get("status") == "answered",
      f"{after.get('status')} / skor={after.get('top_score')}")
check("Yanit yeni SSS kaydini kaynak gosteriyor",
      any("Panel SSS" in s["file"] for s in after.get("sources", [])),
      str([s["file"] for s in after.get("sources", [])][:3]))

# --------------------------------------------------------------- 5) temizlik
print("\n[5] Test verilerinin temizlenmesi")
for u in TEST_USERS:
    call("POST", "/api/admin/users/delete", {"username": u}, token=owner_token)
status, users = call("GET", "/api/admin/users", token=owner_token)
check("Test hesaplari silindi",
      not any(u["username"] in TEST_USERS for u in users["users"]), "kalan hesap var")

# SSS test kaydini hem Chroma'dan hem jsonl'den kaldir
try:
    from pathlib import Path

    import local_rag_answer
    from local_ingest import CHECKPOINT_FILE, get_collection

    entries_file = Path("sss_entries.jsonl")
    kept, removed_ids = [], []
    for line in entries_file.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        e = json.loads(line)
        (removed_ids.append(e["chunk_id"]) if e["question"] == TEST_QUESTION else kept.append(line))
    if removed_ids:
        get_collection().delete(ids=removed_ids)
        entries_file.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
        # checkpoint'ten de dus, aksi halde ayni id tekrar eklenemez
        lines = [l for l in CHECKPOINT_FILE.read_text(encoding="utf-8").splitlines()
                 if l not in removed_ids]
        CHECKPOINT_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
        local_rag_answer._bm25_cache.clear()
    check("Test SSS kaydi silindi", bool(removed_ids), "kayit bulunamadi")
except Exception as e:
    check("Test SSS kaydi silindi", False, str(e))

print(f"\n===== SONUC: {len(passed)} gecti, {len(failed)} basarisiz =====")
if failed:
    for f in failed:
        print("  - " + f)
sys.exit(1 if failed else 0)
