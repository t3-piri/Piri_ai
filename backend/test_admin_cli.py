r"""Terminal yonetim aracinin (admin_panel.py) rol bazli menu davranisi testi.

Sunucu gerektirmez; admin_panel.py'yi alt surec olarak calistirip stdin besler.
Proje kok dizininden calistirilir:
    .\.venv-local\Scripts\python.exe backend\test_admin_cli.py
"""

import os
import subprocess
import sys
from pathlib import Path

import users as user_store

PY = sys.executable
ADMIN_PANEL = Path(__file__).parent / "admin_panel.py"
OWNER_USER = os.environ.get("OWNER_USERNAME", "sahip")
OWNER_PW = os.environ.get("ADMIN_PASSWORD", "admin123")
TEST_USERS = {"t_cli_izleyici": "izleyici", "t_cli_editor": "editor", "t_cli_yonetici": "yonetici"}
TEST_PW = "test1234"

passed, failed = [], []


def check(name, condition, detail=""):
    (passed if condition else failed).append(name)
    print(f"  [{'OK ' if condition else 'HATA'}] {name}" + (f" -> {detail}" if detail and not condition else ""))


def run_cli(username, password, extra_input="0\n"):
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.run(
        [PY, str(ADMIN_PANEL)],
        input=f"{username}\n{password}\n{extra_input}",
        capture_output=True, text=True, encoding="utf-8", env=env, timeout=180,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def menu_items(output):
    """Menudeki [n] Etiket satirlarini toplar ([0] Cikis haric)."""
    items = []
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("[") and "]" in line and not line.startswith("[0]"):
            label = line.split("]", 1)[1].strip()
            if label and label not in items:
                items.append(label)
    return items


print("\n[0] Test hesaplari hazirlaniyor")
user_store.ensure_owner()
for name, role in TEST_USERS.items():
    try:
        user_store.delete_user(name)
    except user_store.UserError:
        pass
    user_store.create_user(name, TEST_PW, role, display_name=f"CLI {role}", created_by="test")
check("Test hesaplari olusturuldu",
      all(user_store.get_user(n) for n in TEST_USERS), "eksik hesap")

print("\n[1] Hatali giris")
code, out = run_cli(OWNER_USER, "yanlis-sifre")
check("Yanlis sifreyle giris reddediliyor", code != 0 and "hatali" in out.lower(), f"kod={code}")
code, out = run_cli("olmayan_kullanici", TEST_PW)
check("Olmayan kullanici reddediliyor", code != 0, f"kod={code}")

print("\n[2] Sahip - tum islemler goruntuleniyor")
code, out = run_cli(OWNER_USER, OWNER_PW)
items = menu_items(out)
check("Sahip girisi basarili", "Giriş başarılı" in out and "Sahip" in out, out[-200:])
check("Sahip 8 islem goruyor", len(items) == 8, f"{len(items)}: {items}")
check("Sahip kullanici yonetimini goruyor",
      any("Kullanıcı/rol yönetimi" in i for i in items), str(items))

print("\n[3] Gozlemci - yalnizca goruntuleme")
code, out = run_cli("t_cli_izleyici", TEST_PW)
items = menu_items(out)
check("Gozlemci girisi basarili", "Gözlemci" in out, out[-200:])
check("Gozlemci 2 islem goruyor", len(items) == 2, f"{len(items)}: {items}")
check("Gozlemci yukleme goremiyor",
      not any("yükle" in i.lower() for i in items), str(items))
check("Gozlemci silme goremiyor",
      not any("sil" in i.lower() for i in items), str(items))
check("Gozlemci kullanici yonetimi goremiyor",
      not any("Kullanıcı" in i for i in items), str(items))
check("Gozlemci soru yanitlayamiyor",
      not any("yanıtla" in i.lower() for i in items), str(items))

print("\n[4] Icerik Editoru - yukler ve yanitlar, silemez")
code, out = run_cli("t_cli_editor", TEST_PW)
items = menu_items(out)
check("Editor girisi basarili", "İçerik Editörü" in out, out[-200:])
check("Editor 5 islem goruyor", len(items) == 5, f"{len(items)}: {items}")
check("Editor yukleme goruyor", any("yükle" in i.lower() for i in items), str(items))
check("Editor soru yanitlamayi goruyor", any("yanıtla" in i.lower() for i in items), str(items))
check("Editor 'Kaynak dosyası sil' goremiyor",
      not any(i.startswith("Kaynak dosyası sil") for i in items), str(items))
check("Editor kullanici yonetimi goremiyor",
      not any("Kullanıcı" in i for i in items), str(items))

print("\n[5] Yonetici - kullanicilari gorur, yonetemez")
code, out = run_cli("t_cli_yonetici", TEST_PW)
items = menu_items(out)
check("Yonetici girisi basarili", "Yönetici" in out, out[-200:])
check("Yonetici 7 islem goruyor", len(items) == 7, f"{len(items)}: {items}")
check("Yonetici kullanicilari listeleyebiliyor",
      any("Kullanıcıları listele" in i for i in items), str(items))
check("Yonetici kullanici YONETEMIYOR",
      not any("Kullanıcı/rol yönetimi" in i for i in items), str(items))
check("Yonetici silme goruyor",
      any(i.startswith("Kaynak dosyası sil") for i in items), str(items))

print("\n[6] Bekleyen sorularin listelenmesi (gercek veri)")
code, out = run_cli(OWNER_USER, OWNER_PW, extra_input="5\n0\n")
check("Soru listesi calisiyor", "Toplam soru:" in out, out[-300:])

print("\n[7] Temizlik")
for name in TEST_USERS:
    try:
        user_store.delete_user(name)
    except user_store.UserError:
        pass
check("Test hesaplari silindi",
      not any(user_store.get_user(n) for n in TEST_USERS), "kalan hesap var")

print(f"\n===== SONUC: {len(passed)} gecti, {len(failed)} basarisiz =====")
if failed:
    for f in failed:
        print("  - " + f)
sys.exit(1 if failed else 0)
