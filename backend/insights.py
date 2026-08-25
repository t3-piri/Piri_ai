"""Sorumlunun sistemi izleyip iyilestirmesi icin uc sinyal:
  1) yanit kalitesi     - basariyla cevaplanmis sorularin guven dagilimi
  2) insana yonlendirme - kanit yetersizligiyle sorumluya devredilen soru orani
  3) sik sorulan konular - HENUZ CEVAPLANAMAMIS, sorumluya yonlenen sorular
     arasinda anlamca (kelime kelime degil) tekrar eden kumeler

Kumeleme icin RAG'de zaten yuklu olan embedding modeli yeniden kullanilir -
ek bagimlilik veya ayri bir servis gerekmez.
"""

import time

from local_embed import embed_passages
from local_rag_answer import CONFIDENCE_HIGH

FREQUENT_MIN_COUNT = 2
FREQUENT_SIMILARITY = 0.86
FREQUENT_TOP_N = 20


def quality_breakdown(log):
    """Basariyla cevaplanmis sorularin guven seviyesine gore dagilimi."""
    answered = [e for e in log if e["status"] == "answered" and e.get("top_score") is not None]
    high = sum(1 for e in answered if e["top_score"] > CONFIDENCE_HIGH)
    return {"high": high, "mid": len(answered) - high, "total": len(answered)}


def recent_cutoff(days):
    """'simdi - days gun' zaman damgasi (log formatiyla: 'YYYY-MM-DD HH:MM:SS')."""
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - days * 86400))


def referral_rate(log, since=None, until=None):
    """[since, until) araligindaki kayitlarda insana yonlendirme orani.
    Zaman damgalari sabit genislikte oldugundan sozlukce (lexical) karsilastirma
    kronolojik karsilastirmayla ayni sonucu verir; ayristirmaya gerek yoktur."""
    subset = [
        e for e in log
        if (since is None or e["timestamp"] >= since)
        and (until is None or e["timestamp"] < until)
    ]
    total = len(subset)
    referred = sum(1 for e in subset if e["status"] == "low_confidence")
    return {
        "total": total,
        "referred": referred,
        "rate": round(referred / total, 4) if total else None,
    }


def activity_by_month(log, years_back=4):
    """Son `years_back` yil icin yil x ay (12 hucre) etkinlik izgarasi.

    Her hucre o ay gelen toplam soruyu ve bunlarin kacinin insana
    yonlendirildigini tasir; sorumlu boylece hangi donemde ne kadar yogunluk
    oldugunu ve yogunlugun ne kadarinin cevapsiz kaldigini tek bakista gorur.
    Zaman damgasi 'YYYY-MM-DD HH:MM:SS' sabit genislikte oldugu icin yil/ay
    dilimlemeyle okunur - ayristirma maliyeti yok."""
    current_year = int(time.strftime("%Y"))
    first_year = current_year - years_back + 1

    grid = {
        year: [{"total": 0, "referred": 0} for _ in range(12)]
        for year in range(first_year, current_year + 1)
    }

    for entry in log:
        stamp = entry.get("timestamp") or ""
        if len(stamp) < 7:
            continue
        try:
            year = int(stamp[:4])
            month = int(stamp[5:7])
        except ValueError:
            continue
        if year not in grid or not 1 <= month <= 12:
            continue
        cell = grid[year][month - 1]
        cell["total"] += 1
        if entry.get("status") == "low_confidence":
            cell["referred"] += 1

    return [{"year": year, "months": grid[year]} for year in sorted(grid)]


def _cosine_clusters(vectors, threshold):
    """Kucuk N icin yeterince hizli, basit greedy kumeleme: ilk atanmamis
    ogenin vektoru kumenin 'temsilcisi' olur, esik ustundeki her atanmamis
    oge o kumeye eklenir."""
    n = len(vectors)
    assigned = [False] * n
    clusters = []
    for i in range(n):
        if assigned[i]:
            continue
        members = [i]
        assigned[i] = True
        for j in range(i + 1, n):
            if not assigned[j] and float(vectors[i] @ vectors[j]) >= threshold:
                members.append(j)
                assigned[j] = True
        clusters.append(members)
    return clusters


def frequent_unanswered(entries, min_count=FREQUENT_MIN_COUNT,
                        threshold=FREQUENT_SIMILARITY, top_n=FREQUENT_TOP_N):
    """entries: henuz SSS ile cevaplanmamis, kanit yetersizligiyle sorumluya
    yonlenen ('low_confidence') qa_log kayitlari - AI'in basariyla cevapladigi
    sorular DAHIL EDILMEZ. Her yarisma/baglam kendi icinde kumelenir, cunku
    ayni ifadeyle sorulan bir soru farkli yarismalar icin farkli cevap
    gerektirebilir."""
    by_scope = {}
    for e in entries:
        by_scope.setdefault(e.get("competition") or "Genel", []).append(e)

    results = []
    for scope, items in by_scope.items():
        if len(items) < min_count:
            continue
        vectors = embed_passages([it["question"] for it in items], batch_size=32, show_progress_bar=False)
        for members in _cosine_clusters(vectors, threshold):
            if len(members) < min_count:
                continue
            group = sorted((items[i] for i in members), key=lambda e: e["timestamp"], reverse=True)
            representative = group[0]["question"]
            variants = [g["question"] for g in group[1:] if g["question"] != representative]
            results.append({
                "question": representative,
                "competition": scope,
                "count": len(group),
                "last_asked": group[0]["timestamp"],
                "variants": variants[:6],
            })

    results.sort(key=lambda c: (c["count"], c["last_asked"]), reverse=True)
    return results[:top_n]
