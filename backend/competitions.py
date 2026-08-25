import difflib
from pathlib import Path

ROOT = Path("Piri-veriler")

# Bunlar "yarisma" degil, capraz-kesim genel kaynak klasorleridir; yarisma
# tespiti/secimi akislarinda aday olarak sunulmazlar (bkz. local_ingest.SPECIAL_CATEGORIES).
GENERAL_FOLDERS = {"Genel ve Etik kuralar", "SSS"}


class InvalidCompetitionName(ValueError):
    """Yarisma/kategori adi olarak kullanilamayacak (yol gezinme icerebilen) bir deger."""


def sanitize_competition_name(name):
    """Admin tarafindan girilen yarisma/kategori adini, ROOT altinda TEK bir
    klasor adi olarak guvenli hale getirir. Bu deger dogrudan `ROOT / name`
    seklinde dosya sistemine yaziliyor (bkz. web_app.api_admin_upload,
    admin_panel.upload_or_update_source); '/','\\' veya '..' icermesi
    ROOT disina yol gezinmeye (path traversal) izin verir - bu yuzden burada
    tek bir yerde dogrulaniyor."""
    cleaned = (name or "").strip()
    if not cleaned:
        raise InvalidCompetitionName("Yarışma/kategori adı boş olamaz.")
    if "/" in cleaned or "\\" in cleaned or "\x00" in cleaned:
        raise InvalidCompetitionName("Yarışma/kategori adı klasör ayırıcı karakter içeremez.")
    if cleaned in (".", ".."):
        raise InvalidCompetitionName("Geçersiz yarışma/kategori adı.")
    return cleaned


def list_competitions():
    if not ROOT.exists():
        return []
    return sorted(p.name for p in ROOT.iterdir() if p.is_dir())


def list_real_competitions():
    """Genel/SSS disindaki gercek yarisma adlari - kullaniciya 'hangi yarisma?'
    diye sorarken veya bir mesajda yarisma adi ararken kullanilir."""
    return [n for n in list_competitions() if n not in GENERAL_FOLDERS]


def find_matches(user_text, limit=5):
    """Kullanicinin serbest metnini bilinen yarisma adlarina eslemeye calisir
    (kullanici kisa bir isim yazdiginda: 'metin, isim icinde substring mi').
    Once tam eslesme, sonra alt-dize eslesmesi, sonra bulanik (fuzzy) eslesme dener."""
    names = list_real_competitions()
    text_low = user_text.strip().casefold()
    if not text_low:
        return []

    exact_hits = [n for n in names if n.casefold() == text_low]
    if exact_hits:
        return exact_hits[:1]

    substring_hits = [n for n in names if text_low in n.casefold()]
    if substring_hits:
        return substring_hits[:limit]

    return difflib.get_close_matches(user_text, names, n=limit, cutoff=0.4)


def detect_competition_mention(text):
    """Serbest bir metin (soru vb.) icinde bilinen bir yarisma adinin gecip
    gecmedigini tespit eder (find_matches'in ters yonu: 'isim, metnin icinde
    substring mi'). Ust-kume adlarla karismamasi icin en uzun (en spesifik)
    eslesmeyi tercih eder (orn. 'Su Altı Roket Yarışması' > 'Roket Yarışması')."""
    text_low = text.casefold()
    candidates = sorted(list_real_competitions(), key=len, reverse=True)
    for name in candidates:
        if name.casefold() in text_low:
            return name
    return None
