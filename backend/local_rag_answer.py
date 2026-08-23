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


GEN_MODELS = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-3.5-flash"]
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
   yarışma/kategoriyle ilgiliyse lütfen doğru bağlamı belirtin.\""""

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
2. Kaynak pasajlar soruyu net karşılamıyorsa, bilgiler çelişkiliyse ya da soru
   yorum/takdir gerektiriyorsa: ASLA yanıt uydurma. Şunu söyle:
   "Bu konuda şartnamede net bir bilgi bulamadım, {SUPPORT_CONTACT} yönlendirmenizi öneririm."
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


def _call_gemini(prompt, system_prompt):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("GEMINI_API_KEY ortam degiskeni tanimli degil.")
    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(system_instruction=system_prompt, temperature=0.2)
    last_error = None
    for model in GEN_MODELS:
        for attempt in range(3):
            try:
                response = client.models.generate_content(model=model, contents=prompt, config=config)
                return response.text.strip()
            except Exception as e:
                last_error = e
                time.sleep(2 * (attempt + 1))
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
        answer = f"Şu anda teknik bir sorun nedeniyle yanıt üretemiyorum, {SUPPORT_CONTACT} yönlendirmenizi öneririm."

    if out_of_scope_check and "ilgili görünmüyor" in answer:
        status = "out_of_scope"
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
    }


def _try_general(question):
    """Genel kaynaklarda arar ve LLM'e sorar. Sadece net bir cevap
    URETILIRSE (status == 'answered') sonucu dondurur; skor esigi
    gecilmezse VEYA LLM 'net bilgi yok' derse None doner ki yonlendirme
    zinciri bir sonraki adima (yarisma-ozel arama / soru) gecebilsin."""
    hits, score = search_general(question)
    if not hits or score < SCORE_THRESHOLD:
        return None
    result = _generate(question, hits, score, GENERAL_SYSTEM_PROMPT, out_of_scope_check=False)
    return result if result["status"] == "answered" else None


def _try_competition(question, competition):
    """search_general'in ikizi; yalnizca net bir cevap uretilirse sonuc doner."""
    hits, score = search_competition(question, competition)
    if not hits or score < SCORE_THRESHOLD:
        return None
    system_prompt = COMPETITION_SYSTEM_PROMPT.replace("{competition}", competition)
    result = _generate(question, hits, score, system_prompt, out_of_scope_check=True)
    return result if result["status"] == "answered" else None


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
    log_turn(
        competition=competition_label,
        question=question,
        answer=result["answer"],
        status=result["status"],
        top_score=round(result["top_score"], 4) if result["top_score"] is not None else None,
        timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
    )
    result["current_competition"] = current_competition
    return result


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
    mentioned = detect_competition_mention(question)

    if mentioned:
        result = _try_competition(question, mentioned) or _try_general(question)
        return _finalize(question, result, mentioned, mentioned)

    result = _try_general(question)
    if result:
        return _finalize(question, result, GENERAL_LABEL, current_competition)

    if current_competition is None:
        return {
            "answer": "Bu sorunuz hangi yarışmayla ilgili? Lütfen yarışma adını belirtin.",
            "status": "needs_competition",
            "confidence": None,
            "top_score": None,
            "sources": [],
            "current_competition": None,
        }

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
