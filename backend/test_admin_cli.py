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
TEST_USERS = {
    "t_cli_sistem": "sistem_yoneticisi",
    "t_cli_icerik": "icerik_yoneticisi",
    "t_cli_destek": "destek_ekibi",
}
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

print("\n[3] Sistem Yoneticisi - bu CLI aracinda islevi yok (analitik yalnizca web panelde)")
code, out = run_cli("t_cli_sistem", TEST_PW)
items = menu_items(out)
check("Sistem Yoneticisi girisi basarili", "Sistem Yöneticisi" in out, out[-200:])
check("Sistem Yoneticisi CLI'da hicbir islem goremiyor", len(items) == 0, f"{len(items)}: {items}")
check("Sistem Yoneticisi ilgili uyariyi aliyor",
      "bu araçta kullanabileceği bir işlem yok" in out, out[-200:])

print("\n[4] Icerik Yoneticisi - yukler ve pasife alir, yanitlayamaz/silemez")
code, out = run_cli("t_cli_icerik", TEST_PW)
items = menu_items(out)
check("Icerik Yoneticisi girisi basarili", "İçerik Yöneticisi" in out, out[-200:])
check("Icerik Yoneticisi 3 islem goruyor", len(items) == 3, f"{len(items)}: {items}")
check("Icerik Yoneticisi yukleme goruyor", any("yükle" in i.lower() for i in items), str(items))
check("Icerik Yoneticisi soru yanitlamayi GOREMIYOR",
      not any("yanıtla" in i.lower() for i in items), str(items))
check("Icerik Yoneticisi 'Kaynak dosyası sil' goremiyor",
      not any(i.startswith("Kaynak dosyası sil") for i in items), str(items))
check("Icerik Yoneticisi kullanici yonetimi goremiyor",
      not any("Kullanıcı" in i for i in items), str(items))

print("\n[5] Destek Ekibi - sadece soru gorur ve yanitlar")
code, out = run_cli("t_cli_destek", TEST_PW)
items = menu_items(out)
check("Destek Ekibi girisi basarili", "Destek Ekibi" in out, out[-200:])
check("Destek Ekibi 2 islem goruyor", len(items) == 2, f"{len(items)}: {items}")
check("Destek Ekibi soru yanitlamayi goruyor", any("yanıtla" in i.lower() for i in items), str(items))
check("Destek Ekibi yukleme GOREMIYOR",
      not any("yükle" in i.lower() for i in items), str(items))
check("Destek Ekibi kullanici yonetimi goremiyor",
      not any("Kullanıcı" in i for i in items), str(items))

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
