import json
from pathlib import Path

LOG_FILE = Path("qa_log.jsonl")


def log_turn(competition, question, answer, status, top_score, timestamp):
    """status: 'answered' | 'low_confidence'
    ('low_confidence' = yonlendirme zincirinin hicbir asamasi (genel veya
    yarisma-ozel) net bir cevap uretemedi; 'unanswered' - destek ekibi/
    sistem yoneticisi icin loglanir)"""
    entry = {
        "timestamp": timestamp,
        "competition": competition,
        "question": question,
        "answer": answer,
        "status": status,
        "top_score": top_score,
    }
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


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
