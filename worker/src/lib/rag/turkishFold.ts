// backend/local_rag_answer.py'deki _tokenize()/_TR_FOLD'un karsiligi:
// Turkce karakterleri ASCII'ye katlar (katılım/katilim ayni token olsun),
// boylece aksansiz/hatali yazilmis sorgular da BM25'te eslesir.

const FOLD_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

// GERCEK BUG (kullanicinin canli testinde bulundu, kok neden arastirmasi):
// JS'in locale-duyarsiz String.prototype.toLowerCase()'i Turkce buyuk "İ"yi
// duz "i" DEGIL, "i" + GORUNMEZ BIRLESTIRICI NOKTA (U+0307) ikilisine
// cevirir (Unicode varsayilan davranisi) — asagidaki eski kod once
// toLowerCase() cagirip SONRA harf-harf FOLD_MAP'e bakiyordu, bu yuzden
// "İ" zaten "i"+U+0307'ye donusmus oluyor ve o birlestirici nokta hicbir
// eslemeye uymadan oldugu gibi kaliyordu. Sonuc: "İ" iceren HER yarisma adi
// ("Dikey İnişli Roket Yarışması" gibi), kullanicinin yazdigi duz "i"'li
// metinle ASLA eslesmiyordu (detectCompetitionMention'da tamamen sessiz bir
// false-negative, BM25 tokenizasyonunda da ayni sorun). Duzeltme: İ/I harf
// harf DEGISTIRME toLowerCase()'DEN ONCE yapiliyor, boylece o birlestirici
// isaret hic ortaya cikmiyor.
export function foldTurkish(text: string): string {
  const asciiI = text.replace(/İ/g, "i").replace(/I/g, "i");
  return asciiI
    .toLowerCase()
    .split("")
    .map((ch) => FOLD_MAP[ch] ?? ch)
    .join("");
}

const TOKEN_RE = /[a-z0-9]+/g;

export function tokenize(text: string): string[] {
  return foldTurkish(text).match(TOKEN_RE) ?? [];
}
