"""Siralanmis yonlendirme (routing) mantiginin 4 senaryo testi:
1) Genel kural sorusu -> direkt genel kaynaktan cevap, yarisma sorulmaz
2) Yarisma adi belirtilen soru -> o yarismanin kaynaklarindan cevap
3) Yarisma adi belirtilmeyen, yarismaya-ozel soru -> sistem yarisma sormali
4) Hicbir yerde bulunamayan soru -> "yeterli bilgi bulamadi" + loglanir"""

from local_rag_answer import GENERAL_LABEL, answer_question
from qa_log import read_log


def ok(label, condition):
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}")
    return condition


def last_log_entry():
    log = read_log()
    return log[-1] if log else None


def test_1_general_question():
    print("\n=== SENARYO 1: Genel kural sorusu ===")
    question = "Etik kurallara aykırı davranışta bulunan bir takıma ne uygulanır?"
    result = answer_question(question, current_competition=None)
    print("Yanit:", result["answer"][:300])
    all_ok = True
    all_ok &= ok("yarisma SORULMADI (needs_competition degil)", result["status"] != "needs_competition")
    entry = last_log_entry()
    all_ok &= ok(
        "genel kaynaktan cevaplandi (log'da 'competition' == GENERAL_LABEL)",
        entry is not None and entry["competition"] == GENERAL_LABEL,
    )
    return all_ok


def test_2_competition_named():
    print("\n=== SENARYO 2: Yarisma adi belirtilen soru ===")
    question = "Roket yarışmasında takımda en az en fazla kaç kişi olabilir?"
    result = answer_question(question, current_competition=None)
    print("Yanit:", result["answer"][:300])
    all_ok = True
    all_ok &= ok("yarisma dogru tespit edildi", result["current_competition"] == "Roket Yarışması")
    all_ok &= ok("status == answered", result["status"] == "answered")
    return all_ok


def test_3_competition_not_named():
    print("\n=== SENARYO 3: Yarisma adi belirtilmeyen, yarismaya-ozel soru ===")
    question = "Bu yarışmada motor izolasyon malzemesi olarak hangi ürün onaylıdır?"
    result = answer_question(question, current_competition=None)
    print("Yanit:", result["answer"][:300])
    return ok("sistem yarisma sormali (status == needs_competition)", result["status"] == "needs_competition")


def test_4_not_found_anywhere():
    print("\n=== SENARYO 4: Hicbir yerde bulunamayan soru ===")
    question = "Roket yarışması bağlamında marsta koloni kurma stratejisi nasıl olmalı ve evlilik törenleri nasıl düzenlenir?"
    result = answer_question(question, current_competition=None)
    print("Yanit:", result["answer"][:300])
    all_ok = True
    all_ok &= ok("status == low_confidence", result["status"] == "low_confidence")
    entry = last_log_entry()
    all_ok &= ok(
        "log'a kaydedildi",
        entry is not None and entry["question"] == question and entry["status"] == result["status"],
    )
    return all_ok


if __name__ == "__main__":
    results = {
        "1 (genel soru)": test_1_general_question(),
        "2 (yarisma belirtilmis)": test_2_competition_named(),
        "3 (yarisma belirtilmemis)": test_3_competition_not_named(),
        "4 (hic bulunamayan)": test_4_not_found_anywhere(),
    }
    print("\n===== SONUC =====")
    for k, v in results.items():
        print(f"Senaryo {k}: {'BASARILI' if v else 'BASARISIZ'}")
