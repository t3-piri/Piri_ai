// backend/local_rag_answer.py _looks_like_gibberish/_reports_live_problem'in
// birebir karşılığı.

import { foldTurkish } from "./turkishFold";

const VOWELS = new Set("aeıioöuüAEIİOÖUÜ".split(""));

function isRepeatingPattern(token: string): boolean {
  const n = token.length;
  for (let period = 1; period <= Math.floor(n / 2); period++) {
    if (n % period === 0 && token === token.slice(0, period).repeat(n / period)) {
      return true;
    }
  }
  return false;
}

function looksLikeWord(token: string): boolean {
  if (![...token].some((c) => VOWELS.has(c))) return false;
  if (/(.)\1{3,}/.test(token)) return false;
  if (isRepeatingPattern(token)) return false;
  return true;
}

export function looksLikeGibberish(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  return !words.some((w) => w.length >= 2 && looksLikeWord(w));
}

// Kullanicinin SU AN yasadigi somut bir teknik/sistemsel sorunu metin
// uzerinde (LLM'e sormadan) yakalar. backend/local_rag_answer.py
// _PROBLEM_SUBSTRINGS/_CONDITIONAL_MARKERS ile birebir.
const PROBLEM_SUBSTRINGS = [
  "giremiyorum", "giremedim", "girilmiyor", "girilemiyor",
  "erisemiyorum", "erisilemiyor",
  "gonderilmiyor", "gonderemiyorum", "gonderilemiyor", "gonderilemedi",
  "yuklenmiyor", "yukleyemiyorum", "yuklenemiyor", "yuklenemedi",
  "kayit olamiyorum", "kayit yapamiyorum", "kaydolamiyorum",
  "basvuru yapamiyorum", "basvuramiyorum", "basvurum gitmiyor",
  "tamamlanamiyor", "kaydedilemiyor", "onaylanamiyor",
  "acilmiyor", "acilamiyor", "acilmadi", "calismiyor", "calismadi",
  "yanit veremiyor", "cevap veremiyor", "islem yapamiyorum",
  "gozukmuyor", "gorunmuyor", "goremiyorum", "kayboldu", "silinmis",
  "ariza", "bozuk", "coktu", "cokuyor", "kilitlendi", "donuyor",
  "takildi", "askida kaldi", "hata aliyorum", "hata veriyor", "hata kodu",
  "sorun var", "sikinti var", "problem var",
];

const CONDITIONAL_MARKERS = [
  "olursa", "yasarsam", "yasarsak", "yasanirsa", "karsilasirsam",
  "karsilasirsak", "durumunda", "oldugu takdirde", "meydana gelirse",
];

export function reportsLiveProblem(question: string): boolean {
  const folded = foldTurkish(question);
  if (CONDITIONAL_MARKERS.some((marker) => folded.includes(marker))) return false;
  return PROBLEM_SUBSTRINGS.some((pat) => folded.includes(pat));
}
