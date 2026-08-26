import os
import re
import sys
import time

from dotenv import load_dotenv
from google import genai
from google.genai import types
from rank_bm25 import BM25Okapi

from competitions import detect_competition_mention, find_matches, list_competitions
from local_ingest import get_collection
from local_embed import embed_query
from qa_log import log_turn

load_dotenv()

TOKEN_RE = re.compile(r"[a-zçğıöşü0-9]+", re.IGNORECASE)
_TR_FOLD = str.maketrans("çğıöşü", "cgiosu")


def _tokenize(text):
    """Turkce karakterleri ASCII'ye katlar (katılım/katilim ayni token olsun),
    boylece aksansiz/hatali yazilmis sorgular da BM25'te eslesir."""
    folded = text.casefold().translate(_TR_FOLD)
    return TOKEN_RE.findall(folded)


_VOWELS = set("aeıioöuüAEIİOÖUÜ")


def _is_repeating_pattern(token):
    """'asdasd' ('asd'*2), 'abab' ('ab'*2) gibi kisa bir birimin tekrariyla
    olusan klavye karalamalarini yakalar - 4+ ayni harf tekrarinin
    (bkz. _looks_like_word) yakalayamadigi durum."""
    n = len(token)
    for period in range(1, n // 2 + 1):
        if n % period == 0 and token == token[:period] * (n // period):
            return True
    return False


def _looks_like_word(token):
    """Kaba bir 'gercek kelimeye benziyor mu' testi - sozluk kontrolu DEGIL,
    sadece bariz klavye karalamasini ('dsds', 'asdasd', 'hjkl') elemeye
    yeter: en az bir sesli harf icermeli VE ayni karakter/kisa birim ust
    uste tekrar etmemeli (orn. 'aaaa', 'asdasd')."""
    if not any(c in _VOWELS for c in token):
        return False
    if re.search(r"(.)\1{3,}", token):
        return False
    if _is_repeating_pattern(token):
        return False
    return True


def _looks_like_gibberish(question):
    """Kullanicinin mesaji ANLAMLI ama TEKNOFEST'le alakasiz bir cumle mi
    ('sohbeti temizle' gibi - bu durumda genel arama esigini gecer, LLM'e
    gider ve 'unrelated' olarak dogru siniflandirilir), yoksa hicbir anlam
    tasimayan klavye karalamasi mi ('dsds', 'asdasd')? Ikincisi arama
    esigini (SCORE_THRESHOLD) neredeyse hicbir zaman gecemeyip LLM'e hic
    ulasmadan dogrudan 'hangi yarismayla ilgili?' sorusuna dusuyordu -
    kullaniciya anlamsiz bir girdi icin sanki gercek bir soru sormus gibi
    yarisma secimi dayatmak yaniltici. Bu fonksiyon o iki durumu LLM
    COST'U OLMADAN (kaba bir sezgiyle) ayirir - bkz. answer_question."""
    words = [w for w in question.strip().split() if w]
    if not words:
        return True
    return not any(len(w) >= 2 and _looks_like_word(w) for w in words)


# Kullanicinin SU AN yasadigi somut bir teknik/sistemsel sorunu metin
# uzerinde (LLM'e sormadan) yakalamak icin acik, dusuk-belirsizlikli ifadeler.
# LLM'e (bkz. FLAG_MARKER) TEK BASINA guvenilmiyor: kucuk/ucretsiz modeller
# boyle ikincil bir bicimlendirme talimatini her zaman uygulamayabilir - bu
# yuzden bariz sikayet ifadeleri METIN SEVIYESINDE de, LLM COST'U OLMADAN
# ve LLM'in talimati unutma riski OLMADAN yakalanir (bkz. _reports_live_problem).
_PROBLEM_SUBSTRINGS = [
    # olumsuz eylem: giris/erisim
    "giremiyorum", "giremedim", "girilmiyor", "girilemiyor",
    "erisemiyorum", "erisilemiyor",
    # olumsuz eylem: form/basvuru/kayit
    "gonderilmiyor", "gonderemiyorum", "gonderilemiyor", "gonderilemedi",
    "yuklenmiyor", "yukleyemiyorum", "yuklenemiyor", "yuklenemedi",
    "kayit olamiyorum", "kayit yapamiyorum", "kaydolamiyorum",
    "basvuru yapamiyorum", "basvuramiyorum", "basvurum gitmiyor",
    "tamamlanamiyor", "kaydedilemiyor", "onaylanamiyor",
    # olumsuz eylem: genel islevsellik
    "acilmiyor", "acilamiyor", "acilmadi", "calismiyor", "calismadi",
    "yanit veremiyor", "cevap veremiyor", "islem yapamiyorum",
    # kaybolma/gorunmeme
    "gozukmuyor", "gorunmuyor", "goremiyorum", "kayboldu", "silinmis",
    # ariza/bozukluk bildirimi
    "ariza", "bozuk", "coktu", "cokuyor", "kilitlendi", "donuyor",
    "takildi", "askida kaldi", "hata aliyorum", "hata veriyor", "hata kodu",
    # sistem kullaniciyi disari atma / oturum kapanma bildirimi
    "sistem atiyor", "sistemden atiyor", "beni atiyor", "disari atiyor",
    "oturumu kapatiyor", "oturum kapaniyor", "kendiliginden cikiyor",
    "kendiliginden kapaniyor",
]

# "sorun/sikinti/problem" + iyelik eki ("sorunum", "sikintimiz" vb.) + "var"
# kaliplarini TEK regex'te yakalar: sabit "sorun var" alt-dizesi, Turkce'nin
# sondan eklemeli yapisi yuzunden "sorunum var" gibi COK YAYGIN bir soylenisi
# kacirir (bkz. gercek vaka: "benim bir sorunum var sisteme kayit olurken
# sistem atiyor" - "sorun" ile "var" arasina "um" eki girdigi icin eski
# sabit liste bunu yakalayamadi ve RAG, alakasiz sartname pasajlariyla
# 'Yuksek guven' etiketiyle yanlis bir cevap uretti).
_PROBLEM_VAR_RE = re.compile(r"\b(sorun|sikinti|problem)\w*\s+var\b")

# Yukaridaki ifadeler VARSA BILE, kosullu/varsayimsal bir cumle icindeyse
# ("... olursa ne yapmaliyim" gibi) bu GERCEK bir sikayet degil, genel bir
# surec sorusudur (bkz. SourcesPage/FAQ tarzi "ne yapmaliyim" sorulari) -
# yanlis pozitifi azaltmak icin bu isaretcilerden biri varsa flag atilmaz.
_CONDITIONAL_MARKERS = [
    "olursa", "yasarsam", "yasarsak", "yasanirsa", "karsilasirsam",
    "karsilasirsak", "durumunda", "oldugu takdirde", "meydana gelirse",
]


def _reports_live_problem(question):
    """Kullanicinin SU AN yasadigi somut bir teknik sorunu bildirip
    bildirmedigini METIN SEVIYESINDE (LLM'den BAGIMSIZ) tespit eder - bkz.
    _PROBLEM_SUBSTRINGS. _finalize'da LLM'in kendi isaretiyle (FLAG_MARKER)
    OR'lanir: LLM isareti eklemeyi unutsa/atlasa BILE bariz sikayetler yine
    de Sistem Yoneticisi'ne dusmelidir."""
    folded = question.casefold().translate(_TR_FOLD)
    if any(marker in folded for marker in _CONDITIONAL_MARKERS):
        return False
    if _PROBLEM_VAR_RE.search(folded):
        return True
    return any(pat in folded for pat in _PROBLEM_SUBSTRINGS)


# En hizli/en guvenilir once denenir: testlerde gemini-3.5-flash tutarli
# sekilde ~1-2s'de yanit verdi; gemini-flash-latest zaman zaman "yuksek talep"
# (503) yasiyor ve tek basina 30-60s'e kadar cikabiliyor - bu yuzden son
# siraya alindi (tamamen cikarilmadi, cunku diger ikisi coken bir gunde
# yedek olarak degerli).
# Ucretsiz katmanda GUNLUK kota MODEL BASINA ayridir (bkz. Google AI Studio
# "Rate limits" paneli): "flash"/"flash-lite" ailesi farkli kota kovalarina
# sahip. Bu yuzden 3.x flash ailesi tukendiginde tamamen ayri bir kovaya
# dusen "lite" varyantlari yedek olarak eklendi - gorevimiz (pasajlardan
# 3-4 cumlelik kisa alinti, derin akil yurutme gerektirmiyor) lite modeller
# icin de fazlasiyla yeterli. Listedeki her model tek tek denenip (bkz.
# check_more_candidates.py tarzi test) calistigi dogrulandi; denenip
# ELENENLER (kotasi zaten tukenmis VEYA gorev icin uygunsuz oldugu icin
# kasten DISARIDA birakildi): gemini-2.5-flash / gemini-2.5-flash-lite
# (bu anahtar icin "yeni kullanicilara kapali", 404 donuyor), gemini-pro-latest
# / gemini-3.1-pro-preview / gemini-omni-flash-preview (test aninda zaten
# kota asimi + agir/coklu-modal modeller, bu basit gorev icin gereksiz),
# gemma-4-31b-it (sistem talimatimizla -uzunca bir Turkce prompt- 504 zaman
# asimina dustu, kucuk 'a4b' varyanti sorunsuzdu).
GEN_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    # Son care: Gemini ailesinin tamami (yukarisi) tukenirse tamamen farkli
    # bir model ailesine (acik kaynak Gemma) ve dolayisiyla kesinlikle ayri
    # bir kota kovasina gecer. Kucuk/hizli 'a4b' (MoE, ~4B aktif parametre)
    # varyanti secildi; sistem talimatiyla test edildi, sorunsuz calisiyor.
    "gemma-4-26b-a4b-it",
]
TOP_K = 14
GENERAL_CATEGORIES = ["genel", "sss"]
GENERAL_LABEL = "Genel Kurallar / SSS"

# Kanit yetersizse kesin yanit verme esigi: en yuksek (gercek cosine benzerlik)
# skoru bu esigin altindaysa LLM'e hic sorulmaz, dogrudan yonlendirme yapilir.
SCORE_THRESHOLD = 0.5
CONFIDENCE_HIGH = 0.75

SUPPORT_CONTACT = "ilgili yarışmanın koordinatörüne veya TEKNOFEST resmi destek kanalına"
INSUFFICIENT_EVIDENCE_MESSAGE = (
    "Bu konuda yeterli doğrulanmış bilgi bulamadım. Sorunuzu destek ekibine yönlendiriyorum."
)

# GENERAL_SYSTEM_PROMPT'taki kural 3'un LLM'e ciktisinda BIREBIR kullanmasini
# istedigimiz, "TEKNOFEST/yarisma ile hicbir ilgisi yok" tespitini isaretleyen
# essiz ifade (bkz. _generate: bu ifadeyi iceren cevaplar 'unrelated' olarak
# damgalanir - "hangi yarismayla ilgili?" diye sormak yerine dogrudan destege
# yonlendirilir). COMPETITION_SYSTEM_PROMPT'un "ilgili görünmüyor" ifadesiyle
# (farkli bir kavram: secili yarisma DISINDA bir yarisma sorulmus) kasten
# CAKISMAYACAK sekilde secildi.
UNRELATED_MARKER = "hiçbir ilgisi yok"

# Kullanicinin GENEL bir bilgi sorusu degil, SU AN kendi basina gelen somut
# bir teknik/sistemsel aksakligi (sisteme giremiyorum, form gonderilmiyor vb.)
# bildirdigini isaretlemek icin LLM'e ciktisina ekletilen essiz token (bkz.
# _generate). answered/redirected gibi STATUS'TAN BAGIMSIZDIR: FAQ'ta genel
# bir yonlendirme metni bulunup soru "answered" olarak isaretlense bile,
# kullanicinin YASADIGI somut sorun cozulmus olmaz - Sistem Yoneticisi'ne
# AYRICA, gercek zamanli bir sikayet olarak dusmesi gerekir (bkz.
# qa_log.flagged_reports). Kullaniciya hic gosterilmeden yanittan silinir.
FLAG_MARKER = "[[DESTEK_BILDIRIMI]]"

COMPETITION_SYSTEM_PROMPT = f"""Sen TEKNOFEST yarışmaları için bir yarışmacı destek asistanısın.

BAĞLAM: Bu konuşma yalnızca "{{competition}}" adlı yarışma/kategori ile sınırlıdır.
Sana verilen kaynak pasajlar sadece bu yarışmaya aittir.

ROLÜN:
- Yarışmacı sorusunu doğal/serbest dilde sorar; niyetini doğru yorumla ve ilgili şartname/kılavuz maddesiyle eşleştir.
- Yanıtlarını YALNIZCA verilen kaynak pasajlara dayandır; bunların dışında bilgi ekleme, tahmin etme veya genel bilgini kullanma.
- Her yanıt kısa olmalı (en fazla 3-4 cümle). Kaynak gösterimini sen yapma; bu, ayrıca sistem
  tarafından yanıtın sonuna otomatik olarak eklenecektir.

KURALLAR:
1. Kaynak pasajlarda sorunun cevabı açıkça varsa: kısa ve doğrudan yanıt ver.
2. Kaynak pasajlar bu yarışmayla ilgili olsa da soruyu net karşılamıyorsa, bilgiler çelişkiliyse
   ya da soru yorum/takdir gerektiriyorsa: ASLA yanıt uydurma. Şunu söyle:
   "Bu konuda şartnamede net bir bilgi bulamadım, {SUPPORT_CONTACT} yönlendirmenizi öneririm."
3. Soru açıkça "{{competition}}" ile ilgisizse (başka bir yarışma/konu soruluyorsa), şunu söyle:
   "Bu soru şu an seçili olan '{{competition}}' bağlamıyla ilgili görünmüyor. Sorunuz farklı bir
   yarışma/kategoriyle ilgiliyse lütfen doğru bağlamı belirtin."
4. Kullanıcı genel bir bilgi sorusu sormak yerine ŞU AN kendi başına gelen somut bir
   teknik/sistemsel aksaklığı bildiriyorsa (örn. "sisteme giremiyorum", "başvuru formu
   gönderilmiyor", "yüklediğim dosya kabul edilmiyor", "ödeme sayfası açılmıyor", "hesabım
   kilitlendi"): yukarıdaki kurallara göre normal yanıtını yaz, SONRA yanıtının en sonuna,
   yeni bir satırda, başka hiçbir açıklama eklemeden yalnızca şu işareti koy: {FLAG_MARKER}
   Bu işareti YALNIZCA kullanıcı kendi yaşadığı somut bir sorunu bildirdiğinde kullan;
   "başvuru nasıl yapılır", "hangi belgeler gerekli" gibi genel bilgi sorularında KULLANMA."""

GENERAL_SYSTEM_PROMPT = f"""Sen TEKNOFEST yarışmaları için bir yarışmacı destek asistanısın.

BAĞLAM: Sana verilen kaynak pasajlar TÜM yarışmalar için geçerli olan genel kurallar,
etik kurallar ve Sıkça Sorulan Sorular (SSS) kaynaklarından geliyor (belirli bir
yarışmaya özel değil).

ROLÜN:
- Yarışmacı sorusunu doğal/serbest dilde sorar; niyetini doğru yorumla.
- Yanıtlarını YALNIZCA verilen kaynak pasajlara dayandır; bunların dışında bilgi ekleme, tahmin etme veya genel bilgini kullanma.
- Her yanıt kısa olmalı (en fazla 3-4 cümle). Kaynak gösterimini sen yapma; bu, ayrıca sistem
  tarafından yanıtın sonuna otomatik olarak eklenecektir.

KURALLAR:
1. Kaynak pasajlarda sorunun cevabı açıkça varsa: kısa ve doğrudan yanıt ver.
1a. Soru, katılım şartı/yaş/tarih/ödül gibi normalde yarışmadan yarışmaya değişebilecek
    bir konudaysa AMA kaynak pasajlar TÜM yarışmalar için geçerli genel bir örüntüyü
    açıkça gösteriyorsa (örn. "farklı eğitim seviyelerinden/mesleklerden katılım
    mümkündür" türünde genel bir SSS kaydı): bu genel bilgiyi kaynağa dayanarak ver,
    ardından kesin/detaylı şartların yarışmaya göre değişebileceğini kısaca belirt.
    Bu durumda kullanıcıya hangi yarışmayı kastettiğini SORMA; sadece belirtilen not
    yeterlidir - kullanıcı isterse zaten bir yarışma adı vererek detay isteyebilir.
2. Kaynak pasajlar soruyu net karşılamıyorsa, bilgiler çelişkiliyse ya da soru
   yorum/takdir gerektiriyorsa (AMA soru genel olarak TEKNOFEST/yarışma konusuyla
   ilgili): ASLA yanıt uydurma. Şunu söyle:
   "Bu konuda şartnamede net bir bilgi bulamadım, {SUPPORT_CONTACT} yönlendirmenizi öneririm."
3. Soru TEKNOFEST veya herhangi bir yarışmayla {UNRELATED_MARKER} ise (günlük sohbet,
   hava durumu, genel kültür, kişisel tercih vb. TEKNOFEST dışı bir konu): kaynaklarla
   zorlama bir bağlantı kurmaya ÇALIŞMA ve kullanıcıya hangi yarışmayı kastettiğini
   SORMA - bu soru hiçbir yarışmayla ilgili değil. "Destek ekibine yönlendiriyorum" gibi
   bir ifade KULLANMA. Sadece şunu söyle:
   "Bu soru TEKNOFEST yarışmalarıyla {UNRELATED_MARKER}."
4. Kullanıcı genel bir bilgi sorusu sormak yerine ŞU AN kendi başına gelen somut bir
   teknik/sistemsel aksaklığı bildiriyorsa (örn. "sisteme giremiyorum", "başvuru formu
   gönderilmiyor", "yüklediğim dosya kabul edilmiyor", "ödeme sayfası açılmıyor", "hesabım
   kilitlendi"): yukarıdaki kurallara göre normal yanıtını yaz, SONRA yanıtının en sonuna,
   yeni bir satırda, başka hiçbir açıklama eklemeden yalnızca şu işareti koy: {FLAG_MARKER}
   Bu işareti YALNIZCA kullanıcı kendi yaşadığı somut bir sorunu bildirdiğinde kullan;
   "başvuru nasıl yapılır", "hangi belgeler gerekli" gibi genel bilgi sorularında KULLANMA.
"""


def format_confidence(score):
    if score > CONFIDENCE_HIGH:
        return "Yüksek güven"
    if score >= SCORE_THRESHOLD:
        return "Orta güven"
    return "Düşük güven"


def format_sources_block(hits):
    """Kullanilan her chunk'in kaynagini (dosya adi + varsa sayfa/slayt/satir)
    yanitin sonuna eklemek icin dosya bazinda gruplanmis, benzersiz bir blok uretir."""
    locators_by_file = {}
    for h in hits:
        md = h["metadata"]
        locators_by_file.setdefault(md["file"], [])
        if md.get("locator") and md["locator"] not in locators_by_file[md["file"]]:
            locators_by_file[md["file"]].append(md["locator"])

    lines = []
    for file_name, locators in locators_by_file.items():
        if locators:
            lines.append(f"Kaynak: [{file_name}] ({', '.join(locators)})")
        else:
            lines.append(f"Kaynak: [{file_name}]")
    return "\n".join(lines)


def format_context(hits):
    lines = []
    for i, h in enumerate(hits, start=1):
        md = h["metadata"]
        citation = f"{md.get('competition', md.get('category', ''))} – {md['file']}, {md['locator']}"
        lines.append(f"[{i}] (Kaynak: {citation})\n{h['text']}")
    return "\n\n".join(lines)


_bm25_cache = {}


def _get_bm25_index(cache_key, where_filter):
    """E5 modelinin bu tur resmi/teknik metinlerde skorlari cok sikistirmasi
    (alakasiz parcalarla alakali parca arasinda net ayrim olmamasi) nedeniyle,
    sadece vektor aramasi dogru parcayi ilk 100'e bile getiremeyebiliyor
    (bkz. test: dogru parca 300 parca icinde 148. sirada cikti). BM25 lexical
    arama ile birlestirmek (hybrid search) bu durumu duzeltir."""
    if cache_key not in _bm25_cache:
        collection = get_collection()
        data = collection.get(where=where_filter, include=["documents", "metadatas"])
        tokenized = [_tokenize(d) for d in data["documents"]]
        bm25 = BM25Okapi(tokenized) if tokenized else None
        _bm25_cache[cache_key] = (bm25, data["ids"], data["documents"], data["metadatas"])
    return _bm25_cache[cache_key]


def _hybrid_search(question, where_filter, cache_key, top_k=TOP_K, fetch_k=45, rrf_k=60):
    """Yogun (vektor) ve lexical (BM25) aramayi Reciprocal Rank Fusion ile
    birlestirir, neredeyse ayni metinleri eleyerek (dedup) benzersiz top_k
    parca dondurur. where_filter, aramanin kapsamini (genel kaynaklar veya
    belirli bir yarisma) belirler."""
    collection = get_collection()
    vector = embed_query(question)
    dense = collection.query(
        query_embeddings=[vector.tolist()],
        n_results=fetch_k,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )
    dense_ids = dense["ids"][0] if dense["ids"] else []
    dense_rank = {cid: rank for rank, cid in enumerate(dense_ids, start=1)}
    dense_score_by_id = {
        cid: 1 - dist for cid, dist in zip(dense_ids, dense["distances"][0] if dense["distances"] else [])
    }
    info_by_id = {
        cid: (doc, meta)
        for cid, doc, meta in zip(
            dense_ids,
            dense["documents"][0] if dense["documents"] else [],
            dense["metadatas"][0] if dense["metadatas"] else [],
        )
    }

    bm25, all_ids, all_docs, all_metas = _get_bm25_index(cache_key, where_filter)
    bm25_rank = {}
    if bm25 is not None:
        bm25_scores = bm25.get_scores(_tokenize(question))
        top_idx = sorted(range(len(all_ids)), key=lambda i: -bm25_scores[i])[:fetch_k]
        for rank, idx in enumerate(top_idx, start=1):
            cid = all_ids[idx]
            bm25_rank[cid] = rank
            info_by_id.setdefault(cid, (all_docs[idx], all_metas[idx]))

    fused = []
    for cid in set(dense_rank) | set(bm25_rank):
        score = 0.0
        if cid in dense_rank:
            score += 1 / (rrf_k + dense_rank[cid])
        if cid in bm25_rank:
            score += 1 / (rrf_k + bm25_rank[cid])
        fused.append((cid, score))
    fused.sort(key=lambda x: -x[1])

    hits = []
    seen_text = set()
    for cid, fused_score in fused:
        doc, meta = info_by_id[cid]
        key = doc.strip()[:300]
        if key in seen_text:
            continue
        seen_text.add(key)
        score = dense_score_by_id.get(cid, fused_score)
        hits.append({"text": doc, "metadata": meta, "score": score})
        if len(hits) >= top_k:
            break

    # Yazim hatali/serbest sorgularda BM25 (tam token eslesmesi) yanlis
    # etkileyip RRF siralamasini bozabilir: gercekte cok alakali (yuksek ham
    # cosine benzerligi) bir parca, sadece BM25'te kotu sirlandigi icin
    # top_k disinda kalabilir (bkz. test: "yarismlara" yazim hatasinda, dogru
    # cevabi iceren SSS kaydi ham skoru 0.84 iken RRF sirasinda 30. siraya
    # dustu, top_k=14'e giremedi). Bu yuzden secilen kumedeki en dusuk ham
    # skorlu parcayi, havuzdaki cok daha yuksek ham skorlu (CONFIDENCE_HIGH
    # ustu) bir aday varsa onunla degistiriyoruz - top_k boyutu buyumeden
    # siralama yazim hatasina karsi saglamlasir.
    dense_sorted = sorted(dense_score_by_id.items(), key=lambda kv: -kv[1])
    for cid, dscore in dense_sorted:
        if dscore < CONFIDENCE_HIGH or not hits:
            break
        doc, meta = info_by_id[cid]
        key = doc.strip()[:300]
        if key in seen_text:
            continue
        weakest_idx = min(range(len(hits)), key=lambda i: hits[i]["score"])
        if hits[weakest_idx]["score"] >= dscore:
            continue
        seen_text.discard(hits[weakest_idx]["text"].strip()[:300])
        seen_text.add(key)
        hits[weakest_idx] = {"text": doc, "metadata": meta, "score": dscore}

    # Esik/guven hesaplamasi somut (BM25 degil) cosine benzerligine dayanmali;
    # RRF ile yeniden siralanan hits[0] bir BM25-only sonuc olabilir.
    max_dense_score = max(dense_score_by_id.values(), default=0.0)
    return hits, max_dense_score


def search_general(question, top_k=TOP_K, fetch_k=45, rrf_k=60):
    """Yarisma-bagimsiz genel kurallar/etik/SSS kaynaklarinda arar."""
    where_filter = {"$and": [{"category": {"$in": GENERAL_CATEGORIES}}, {"status": "active"}]}
    return _hybrid_search(question, where_filter, "__general__", top_k, fetch_k, rrf_k)


def search_competition(question, competition, top_k=TOP_K, fetch_k=45, rrf_k=60):
    """Belirli bir yarismanin kendi kaynaklarinda arar."""
    where_filter = {"$and": [{"competition": competition}, {"status": "active"}]}
    return _hybrid_search(question, where_filter, competition, top_k, fetch_k, rrf_k)


# Bizim goreviniz (verilen pasajlardan 3-4 cumlelik kisa bir alinti) hicbir
# derin akil yurutme gerektirmiyor; ama modeller varsayilan olarak (ozellikle
# 3.x ailesi) yanit vermeden once uzun bir "thinking" asamasi calistiriyor -
# olculdugunde bu TEK BASINA 10 saniyeye kadar gecikme ekliyor. Bunu kapatan
# parametrenin adi modelden modele degisiyor (bazisi 'thinking_level', bazisi
# 'thinking_budget' kabul ediyor, digerini 400 ile reddediyor) - bu yuzden
# ilk denemede en yaygin/hafif secenegi kullanip, parametre reddedilirse
# (yanlis parametre - uykuya gerek yok) bir sonrakini hemen deneriz. 'none'
# son çare: bazi (ozellikle 'lite'/preview) modeller thinking_config alanini
# hic kabul etmiyor ve bunu "invalid argument" ile reddediyor - bu durumda
# thinking_config'i tamamen cikarip duz istek deneriz.
_THINKING_STRATEGIES = ["level", "budget", "none"]

# SDK varsayilaninda tek bir cagriya ust sinir YOK - Gemini "yuksek talep"
# yasadiginda (503) bu, tek istegin dakikalarca askida kalmasina (ve kullanici
# tarafinda "Failed to fetch"/zaman asimina) yol acabiliyor. Her cagriya kisa
# bir tavan koyup, o model/strateji basarisiz olursa hemen bir sonrakine
# gecmek, "hicbir zaman yanit vermeyen" bir cagriya kilitlenmekten cok daha
# iyidir - MVP icin gecikmeyi sinirlamak, tam da GEN_MODELS listesindeki en
# yavas modeli sonsuza dek beklemekten daha degerlidir.
_GEMINI_TIMEOUT_MS = 12_000


def _config_for(system_prompt, thinking):
    kwargs = {"system_instruction": system_prompt, "temperature": 0.2}
    if thinking == "level":
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)
    elif thinking == "budget":
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
    return types.GenerateContentConfig(**kwargs)


def _call_gemini(prompt, system_prompt):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("GEMINI_API_KEY ortam degiskeni tanimli degil.")
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=_GEMINI_TIMEOUT_MS))
    last_error = None
    for model in GEN_MODELS:
        for attempt, thinking in enumerate(_THINKING_STRATEGIES):
            try:
                config = _config_for(system_prompt, thinking)
                response = client.models.generate_content(model=model, contents=prompt, config=config)
                return response.text.strip()
            except Exception as e:
                last_error = e
                # Modelin desteklemedigi bir 'thinking' parametresi gonderdik -
                # bu geçici bir sunucu yuku degil, sonraki denemede farkli
                # parametreyi hemen (uyumadan) deneriz. Bazi modeller bunu
                # mesajinda 'thinking' gecmeyen genel bir 400 INVALID_ARGUMENT
                # ile reddediyor (bkz. gemini-3.5-flash-lite) - bu da ayni
                # sekilde ele alinmali, aksi halde 'none' stratejisi hic
                # denenmeden modelden vazgecilir. Diger tum hatalarda (429
                # kota/503/zaman asimi dahil) kisa bir bekleme sonrasi ayni
                # modelde son bir deneme yerine dogrudan siradaki modele geceriz.
                msg = str(e).lower()
                if "thinking" not in msg and "invalid_argument" not in msg:
                    time.sleep(1)
                    break
    raise RuntimeError(f"Uretim basarisiz: {last_error}")


def _generate(question, hits, max_dense_score, system_prompt, out_of_scope_check):
    """Sadece uretir, LOGLAMAZ (routing zincirinde ara denemeler icin -
    ayni soru birden fazla kaynakta denenebildiginden, loglama sadece
    zincirin SONUNDA kesinlesen tek sonuc icin yapilir, bkz. answer_question)."""
    context = format_context(hits)
    prompt = (
        f"Yarışmacı sorusu: {question}\n\nKaynak pasajlar:\n{context}\n\n"
        "Yukarıdaki kurallara uyarak yanıtla."
    )
    try:
        answer = _call_gemini(prompt, system_prompt)
    except RuntimeError:
        # LLM cagrisi basarisiz oldu (kota/503/zaman asimi) - bu, kaynaklarda
        # kanit yetersizligi degil, teknik bir aksakliktir. Asagidaki metin
        # eslesmesi ("SUPPORT_CONTACT in answer" -> "redirected") ile
        # karismasin diye status'u burada, cevap metnine bakmadan sabitliyoruz;
        # aksi halde gercekte alakali kaynak varken bile kullaniciya "kanit
        # yok" mesaji gider (bkz. _try_general/_try_competition).
        answer = f"Şu anda teknik bir sorun nedeniyle yanıt üretemiyorum, {SUPPORT_CONTACT} yönlendirmenizi öneririm."
        return {
            "answer": answer,
            "status": "technical_error",
            "confidence": format_confidence(max_dense_score),
            "top_score": max_dense_score,
            "sources": hits,
        }

    # Kullanicinin ANLIK yasadigi somut bir sorunu bildirip bildirmedigi
    # (bkz. FLAG_MARKER) status'tan BAGIMSIZ, ayri bir sinyaldir; asagidaki
    # status siniflandirmasindan ONCE cikarilir ki isaret hicbir kosulda
    # kullaniciya gosterilen metne karismasin.
    flagged = FLAG_MARKER in answer
    if flagged:
        answer = answer.replace(FLAG_MARKER, "").rstrip()

    if out_of_scope_check and "ilgili görünmüyor" in answer:
        status = "out_of_scope"
    elif UNRELATED_MARKER in answer:
        status = "unrelated"
    elif SUPPORT_CONTACT in answer:
        status = "redirected"
    else:
        status = "answered"
        answer = f"{answer}\n\n{format_sources_block(hits)}\nGüven seviyesi: {format_confidence(max_dense_score)}"

    return {
        "answer": answer,
        "status": status,
        "confidence": format_confidence(max_dense_score),
        "top_score": max_dense_score,
        "sources": hits,
        "flagged": flagged,
    }


def _try_general(question):
    """Genel kaynaklarda arar ve LLM'e sorar. Net bir cevap URETILIRSE
    (status == 'answered'), LLM cagrisi teknik nedenle basarisiz olduysa
    (status == 'technical_error') VEYA soru TEKNOFEST/yarismalarla hicbir
    ilgisi yoksa (status == 'unrelated') sonucu dondurur; skor esigi
    gecilmezse VEYA LLM 'bu yarismayla ilgili net bilgi yok ama konu genel
    olarak TEKNOFEST ile ilgili' derse ('redirected') None doner ki
    yonlendirme zinciri bir sonraki adima (yarisma-ozel arama / hangi
    yarisma oldugunu sorma) gecebilsin. 'technical_error' VE 'unrelated' bir
    sonraki adima GECMEZ: birincisinde API cagrisi ayni sekilde basarisiz
    olacagindan, ikincisinde ise soru zaten hicbir yarismayla ilgili
    olmadigindan, "hangi yarisma?" diye sormak anlamsiz olur - kullaniciya
    dogrudan (yanlislikla 'kanit yok' degil) durumun kendisi iletilir."""
    hits, score = search_general(question)
    if not hits or score < SCORE_THRESHOLD:
        return None
    result = _generate(question, hits, score, GENERAL_SYSTEM_PROMPT, out_of_scope_check=False)
    return result if result["status"] in ("answered", "technical_error", "unrelated") else None


def _try_competition(question, competition):
    """search_general'in ikizi; ayni mantik gecerlidir (bkz. _try_general)."""
    hits, score = search_competition(question, competition)
    if not hits or score < SCORE_THRESHOLD:
        return None
    system_prompt = COMPETITION_SYSTEM_PROMPT.replace("{competition}", competition)
    result = _generate(question, hits, score, system_prompt, out_of_scope_check=True)
    return result if result["status"] in ("answered", "technical_error") else None


def _finalize(question, result, competition_label, current_competition):
    """Zincirin sonunda kesinlesen TEK sonucu loglar (result=None ise
    kanit yetersizligi mesajiyla). Ara denemeler _try_general/_try_competition
    icinde loglanmaz, cift kayit olusmaz."""
    if result is None:
        result = {
            "answer": INSUFFICIENT_EVIDENCE_MESSAGE,
            "status": "low_confidence",
            "confidence": None,
            "top_score": None,
            "sources": [],
        }
    # LLM'in kendi isaretiyle (result["flagged"], bkz. _generate/FLAG_MARKER)
    # metin-seviyeli heuristigi (bkz. _reports_live_problem) OR'lar: LLM
    # ikincil bicimlendirme talimatini atlasa/unutsa BILE (kucuk/ucretsiz
    # modellerde beklenen bir risk) bariz sikayetler yine de Sistem
    # Yoneticisi'ne dusmelidir - status'tan (dahil low_confidence/
    # needs_competition gibi zaten bildirilen durumlardan) BAGIMSIZDIR.
    flagged = result.get("flagged", False) or _reports_live_problem(question)
    log_id = log_turn(
        competition=competition_label,
        question=question,
        answer=result["answer"],
        status=result["status"],
        top_score=round(result["top_score"], 4) if result["top_score"] is not None else None,
        timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
        flagged=flagged,
    )
    result["current_competition"] = current_competition
    result["flagged"] = flagged
    result["log_id"] = log_id
    return result


def _live_problem_result(question, competition_label, current_competition):
    """SU AN yasanan somut bir teknik/sistemsel sorun bildirimi (bkz.
    _reports_live_problem) sartname/SSS icerigiyle YANITLANAMAZ - boyle bir
    girdi retrieval'a hic sokulmadan dogrudan Sistem Yoneticisi'ne
    yonlendirilir. Kaynak/guven rozeti GOSTERILMEZ (status='redirected' ->
    web_app.api_ask sources/confidence'i bos birakir): sartnamede bu soruna
    dair bilgi yokken kaynak gostermek yanlis bir 'Yuksek guven' izlenimi
    verir (bkz. gercek vaka ekran goruntusu)."""
    result = {
        "answer": (
            "Bu, şartnamede yanıtı bulunan bir bilgi sorusu değil; yaşadığınız "
            "teknik/sistemsel bir aksaklık gibi görünüyor. Talebinizi Sistem "
            f"Yöneticisi'ne ilettim, en kısa sürede dönüş yapılacaktır. Acil "
            f"durumlarda {SUPPORT_CONTACT} başvurabilirsiniz."
        ),
        "status": "redirected",
        "confidence": None,
        "top_score": None,
        "sources": [],
        "flagged": True,
    }
    return _finalize(question, result, competition_label, current_competition)


def answer_question(question, current_competition=None):
    """Siralanmis yonlendirme (routing) mantigi:
    1) Mesajda acikca bir yarisma adi geciyorsa: ONCE o yarismanin kendi
       kaynaklarinda ara (genel SSS'teki belirsiz/genel-gecer bir kayit,
       ismen belirtilmis yarismanin kesin sartname bilgisinin onune gecmesin).
       Orada net cevap yoksa, son sans olarak genel kaynaklara bakilir.
    2) Mesajda yarisma adi YOKSA: once genel (SSS/etik/genel kurallar)
       kaynaklarda ara. Net bir cevap varsa DOGRUDAN oradan cevapla; yarisma
       sorma/bakma.
    3) Genel de net cevap vermezse: mevcut oturum bagaminda (current_competition)
       bir yarisma var mi diye bak. Yoksa kullaniciya sormasi icin
       {"status": "needs_competition"} dondurur (CLI/cagiran taraf sorup, ayni
       soruyu current_competition ile tekrar cagirir).
    4) Yarisma belirliyse o yarismanin kaynaklarinda ara; orada da net cevap
       yoksa kanit yetersizligi mesaji ver ve unanswered olarak logla.
    Not: her asama sadece GERCEKTEN cevaplanirsa (status=='answered') o dalda
    sonuclanir; aksi halde bir sonraki kaynak denenir - boylece genel
    kaynaklarin dar bir SSS kaydiyla yanlislikla eslesip daha kesin/dogru bir
    yarisma-ozel cevabin onune gecmesi engellenir."""
    if _reports_live_problem(question):
        return _live_problem_result(question, GENERAL_LABEL, current_competition)

    mentioned = detect_competition_mention(question)

    if mentioned:
        result = _try_competition(question, mentioned) or _try_general(question)
        return _finalize(question, result, mentioned, mentioned)

    result = _try_general(question)
    if result:
        return _finalize(question, result, GENERAL_LABEL, current_competition)

    if current_competition is None:
        if _looks_like_gibberish(question):
            # Anlamsiz girdiye ("dsds" gibi) "hangi yarismayla ilgili?" diye
            # sormak yaniltici - kullanici gercek bir soru sormamisken sanki
            # sormus gibi yarisma secimi dayatilmis olur (bkz. _looks_like_gibberish).
            result = {
                "answer": (
                    "Sorunuzu tam olarak anlayamadım. TEKNOFEST yarışmalarıyla "
                    "ilgili sorunuzu biraz daha açık yazar mısınız?"
                ),
                "status": "unclear",
                "confidence": None,
                "top_score": None,
                "sources": [],
            }
            return _finalize(question, result, GENERAL_LABEL, None)

        # Onceden bu dal hicbir yere loglanmiyordu: kullanici yarisma secmeden
        # cikarsa (ya da hic secmezse) soru qa_log'a hic dusmuyor, Sistem
        # Yoneticisi'nin bundan haberi olmuyordu. Simdi diger tum dallarla
        # ayni sekilde _finalize'dan geciyor ki en azindan kayit altina alinsin
        # (bkz. qa_log.needs_competition_questions).
        result = {
            "answer": "Bu sorunuz hangi yarışmayla ilgili?",
            "status": "needs_competition",
            "confidence": None,
            "top_score": None,
            "sources": [],
        }
        return _finalize(question, result, GENERAL_LABEL, None)

    result = _try_competition(question, current_competition)
    return _finalize(question, result, current_competition, current_competition)


def answer_in_context(question, context, include_general=True):
    """Kullanici arayuzde bagami ACIKCA sectiginde kullanilir: arama yalnizca
    secilen baglamin kaynaklarinda yapilir, diger yarismalarin kaynaklarina
    hic bakilmaz.

    context = GENERAL_LABEL  -> sadece genel kurallar / etik / SSS
    context = <yarisma adi>  -> once o yarismanin kaynaklari; bulunamazsa
        (include_general ise) genel kurallar - cunku genel kurallar ve etik
        kurallar zaten her yarisma icin gecerli olan 'uygun kaynak'tir.
        include_general=False verilirse yalnizca yarismanin kendi kaynaklarina bakilir.

    answer_question()'dan farki: mesaj metninde baska bir yarisma adi gecse
    bile baglam disina cikilmaz."""
    if _reports_live_problem(question):
        return _live_problem_result(question, context or GENERAL_LABEL, context or None)

    if not context or context == GENERAL_LABEL:
        return _finalize(question, _try_general(question), GENERAL_LABEL, None)

    result = _try_competition(question, context)
    if result is None and include_general:
        result = _try_general(question)
    return _finalize(question, result, context, context)


def answer_auto(question, selected_competition=None):
    """Yarismaci arayuzu icin: yarisma secimi ZORUNLU DEGILDIR.

    1) Soru metninde bir yarisma adi geciyorsa -> DOGRUDAN o yarismanin
       kaynaklarinda ara (genel kaynaklar sadece yedek). Ekranda baska bir
       yarisma secili olsa bile metindeki acik niyet oncelikli.
    2) Metinde yarisma adi yoksa ama kullanici ekrandan bir yarisma sectiyse
       -> o yarismanin kaynaklarinda ara (genel kaynaklar yedek).
    3) Ikisi de yoksa -> once genel kurallar/etik/SSS; orada da net cevap
       yoksa kullaniciya hangi yarisma oldugu sorulur (needs_competition).
    """
    mentioned = detect_competition_mention(question)
    if mentioned:
        return answer_in_context(question, mentioned)
    if selected_competition:
        return answer_in_context(question, selected_competition)
    return answer_question(question, None)


def ask_for_competition():
    print("Hangi yarışma hakkında yardım almak istiyorsunuz?")
    while True:
        text = input("> ").strip()
        if not text:
            continue
        matches = find_matches(text)
        if len(matches) == 1:
            return matches[0]
        if not matches:
            print("Eşleşme bulunamadı. Lütfen yarışma adını farklı yazmayı deneyin.")
            continue
        print("Şunlardan birini mi kastettiniz?")
        for i, m in enumerate(matches, start=1):
            print(f"  [{i}] {m}")
        choice = input("Numara girin (veya tekrar yazın): ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(matches):
            return matches[int(choice) - 1]


if __name__ == "__main__":
    if not list_competitions():
        sys.exit("Piri-veriler klasoru bulunamadi veya bos.")

    current_competition = None
    print("TEKNOFEST Yarışmacı Destek Asistanı")
    print("Sorularınızı doğrudan yazabilirsiniz (önce genel kurallarda, gerekirse yarışmaya özel kaynaklarda aranır).")
    print("Bağlamı sıfırlamak için 'değiştir', çıkmak için 'q' yazın.\n")

    while True:
        try:
            q = input("Soru: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not q:
            continue
        if q.lower() in ("q", "quit", "exit"):
            break
        if q.lower() in ("değiştir", "degistir"):
            current_competition = ask_for_competition()
            print(f"\n'{current_competition}' bağlamına geçildi.\n")
            continue

        result = answer_question(q, current_competition)
        if result["status"] == "needs_competition":
            competition = ask_for_competition()
            result = answer_question(q, competition)

        current_competition = result["current_competition"]
        print(f"\n{result['answer']}\n")
