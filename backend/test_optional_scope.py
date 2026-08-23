r"""Yarisma secimi ARTIK ZORUNLU DEGIL: composer'daki secim istege bagli bir
oncelik ipucu; sorunun metninde gecen yarisma adi her zaman kazanir.

Calisan bir sunucu gerektirir (bkz. test_roles_and_context.py basligi).
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = f"http://127.0.0.1:{os.environ.get('PIRI_PORT', '8100')}"
passed, failed = [], []


def ask(question, context=None):
    body = json.dumps({"question": question, "context": context}).encode()
    req = urllib.request.Request(BASE + "/api/ask", data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def check(name, condition, detail=""):
    (passed if condition else failed).append(name)
    print(f"  [{'OK ' if condition else 'HATA'}] {name}" + (f" -> {detail}" if detail and not condition else ""))


status, comps = urllib.request.urlopen(BASE + "/api/contexts", timeout=30), None
comps = json.loads(status.read().decode())["competitions"]
roket = next(c for c in comps if "Roket" in c and "Su Alt" not in c)
other = next(c for c in comps if c != roket and "İHA" in c)

print("[1] Secim yokken: metinde yarisma adi -> o yarismada aranir (genel degil)")
status, res = ask(f"{roket} için takımda kaç kişi olabilir?", context=None)
check("Yanit uretildi", status == 200 and res["status"] in ("answered", "low_confidence"), str(res.get("status")))
check("Kaynak/baglam soru metnindeki yarismaya ait",
      res.get("current_competition") == roket, res.get("current_competition"))

print("\n[2] Secim yokken, metinde yarisma adi da yokken -> genel kaynaklar (soru sormaz)")
status, res = ask("Etik kurallara aykırı davranışın yaptırımı nedir?", context=None)
check("Dogrudan yanitlandi, secim istenmedi",
      status == 200 and res["status"] == "answered", str(res.get("status")))

print("\n[3] Composer'dan bir yarisma secilmisken, soru metninde FARKLI bir yarisma geciyorsa metin kazanir")
status, res = ask(f"{roket} başvuru koşulları neler?", context=other)
check("Yanit uretildi", status == 200, str(status))
check("Metindeki yarisma (secili degil) kazandi",
      res.get("current_competition") == roket,
      f"beklenen={roket!r} gelen={res.get('current_competition')!r}")

print("\n[4] Composer'dan secilmis yarisma, metinde hicbir yarisma adi gecmiyorsa uygulanir")
status, res = ask("Takımda kaç kişi olabilir?", context=other)
check("Yanit uretildi", status == 200, str(status))
check("Secili yarisma uygulandi",
      res.get("current_competition") == other,
      f"beklenen={other!r} gelen={res.get('current_competition')!r}")

print("\n[5] Gecersiz secim reddedilir")
status, res = ask("test", context="Olmayan Bir Yarisma")
check("400 doner", status == 400, str(status))

print(f"\n===== SONUC: {len(passed)} gecti, {len(failed)} basarisiz =====")
if failed:
    for f in failed:
        print("  - " + f)
sys.exit(1 if failed else 0)
