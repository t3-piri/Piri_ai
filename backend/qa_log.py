import json
import uuid
from pathlib import Path

LOG_FILE = Path("qa_log.jsonl")
FEEDBACK_FILE = Path("qa_feedback.jsonl")


def log_turn(competition, question, answer, status, top_score, timestamp, flagged=False):
    """status: 'answered' | 'low_confidence' | 'technical_error' |
    'needs_competition' | 'unclear'
    ('low_confidence' = yonlendirme zincirinin hicbir asamasi (genel veya
    yarisma-ozel) net bir cevap uretemedi; 'unanswered' - destek ekibi/
    sistem yoneticisi icin loglanir. 'technical_error' = kaynaklarda ilgili
    bilgi bulundu ama LLM cagrisi teknik nedenle (kota/503/zaman asimi)
    basarisiz oldu - 'low_confidence' ile karistirilmamali, cunku bu durumda
    sorun bilgi tabaninda degil, uretim asamasindadir. 'needs_competition' =
    soru metninde yarisma adi gecmiyor, ekranda da secili degil ve genel
    kaynaklarda da net cevap yoktu - kullanicidan hangi yarismayi kastettigi
    soruldu; sabit bir yarisma kapsamina baglanamadigindan SSS cevabiyla
    cozulecek bir bilgi bosluğu degildir, ama yine de kullanicinin sistemden
    yanit alamadigi bir andir ve Sistem Yoneticisi'nin gormesi gerekir.
    'unclear' = mesaj anlamsiz/klavye karalamasi gibi gorunuyor (bkz.
    local_rag_answer._looks_like_gibberish) - 'needs_competition'ten farkli
    olarak kullaniciya yarisma secimi DAYATILMAZ, sadece sorusunu acmasi
    istenir; gercek bir soru olmadigindan Sistem Yoneticisi'ne bildirim
    olarak da dusmez, sadece qa_log'da denetim amacli tutulur.

    flagged: status'tan BAGIMSIZ ayri bir boolean sinyal - kullanicinin,
    RAG bir cevap/yonlendirme uretebilmis olsa BILE ('answered' dahil), SU AN
    yasadigi somut bir teknik/sistemsel sorunu bildirdigini isaretler (bkz.
    local_rag_answer.FLAG_MARKER). FAQ'ta genel bir yonlendirme metni
    bulunmus olmasi, kullanicinin yasadigi somut sorunun cozuldugu anlamina
    gelmez - Sistem Yoneticisi'ne GERCEK ZAMANLI bir sikayet olarak AYRICA
    dusmesi gerekir."""
    entry = {
        "id": uuid.uuid4().hex[:12],
        "timestamp": timestamp,
        "competition": competition,
        "question": question,
        "answer": answer,
        "status": status,
        "top_score": top_score,
        "flagged": flagged,
    }
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry["id"]


def read_log():
    if not LOG_FILE.exists():
        return []
    entries = []
    for line in LOG_FILE.read_text(encoding="utf-8").splitlines():
        if line.strip():
            entries.append(json.loads(line))
    return entries


def unresolved_entries():
    return [e for e in read_log() if e["status"] == "low_confidence"]


def unanswered_questions():
    """Madde 3: kanit yetersizligi nedeniyle dogrudan yonlendirilen sorular -
    Sistem Yoneticisi'nin sik sorulan ama cevapsiz kalan konulari gormesi icin."""
    return [e for e in read_log() if e["status"] == "low_confidence"]


def technical_errors():
    """Kullanici tarafinda LLM cagrisi teknik nedenle (kota/503/zaman asimi)
    basarisiz olan turlar - kaynak/bilgi eksikligi degil, sistemsel bir
    aksakliktir. 'low_confidence' ile ayni listeye KARISTIRILMAZ (bkz.
    log_turn dokstring) cunku SSS cevabi yazmakla cozulecek bir bilgi
    bosluğu degildir; yine de Sistem Yoneticisi'ne bildirim olarak
    dusmesi gerekir ki teknik aksakligin farkina varsin."""
    return [e for e in read_log() if e["status"] == "technical_error"]


def needs_competition_questions():
    """Hangi yarismayla ilgili oldugu belirlenemeyen (metinde yarisma adi
    gecmiyor, ekranda da secili degil) ve genel kaynaklarda da net cevap
    bulunamayan sorular - bkz. local_rag_answer.answer_question. Sabit bir
    yarisma kapsamina baglanamadigindan SSS cevabi yazma akisina (bkz.
    unanswered_questions) DAHIL EDILMEZ; yine de kullanicinin yanitsiz
    kaldigi bir andir ve Sistem Yoneticisi'ne bildirim olarak dusmesi
    gerekir."""
    return [e for e in read_log() if e["status"] == "needs_competition"]


def record_feedback(log_id, satisfaction, timestamp):
    """Kullanicinin bir yanitin altindaki begen/begenme (thumbs up/down)
    ile bildirdigi memnuniyet sinyali - Madde 6.1 (yanit kalitesi/kullanici
    memnuniyeti). qa_log.jsonl append-only oldugundan (bkz. log_turn) ilgili
    satiri yeniden yazmak yerine ayri bir dosyaya eklenir; log_id (log_turn'un
    dondurdugu entry id'si) ile eslestirilir."""
    if satisfaction not in ("up", "down"):
        raise ValueError("satisfaction 'up' veya 'down' olmalidir")
    entry = {"log_id": log_id, "satisfaction": satisfaction, "timestamp": timestamp}
    with FEEDBACK_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def read_feedback():
    if not FEEDBACK_FILE.exists():
        return []
    entries = []
    for line in FEEDBACK_FILE.read_text(encoding="utf-8").splitlines():
        if line.strip():
            entries.append(json.loads(line))
    return entries


def flagged_reports():
    """Kullanicinin, status'tan BAGIMSIZ olarak (cevap uretilebilmis olsa
    bile) SU AN yasadigi somut bir teknik/sistemsel sorunu bildirdigi
    turler (bkz. log_turn dokstring 'flagged'). Diger sinyallerle
    (unanswered_questions/technical_errors/needs_competition_questions)
    CAKISABILIR - ayni kayit hem 'answered' hem flagged=True olabilir;
    bu yuzden ayri bir bildirim sinyali olarak dondurulur ki Sistem
    Yoneticisi otomatik bir cevap verilmis olsa bile gercek zamanli bir
    sikayeti kacirmasin."""
    return [e for e in read_log() if e.get("flagged")]
