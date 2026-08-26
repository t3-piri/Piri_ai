// Sohbet gecmisi varsa, son (kisa/eksik olabilecek — ör. "ödül ne") soruyu
// gecmisi kullanarak tek basina anlasilir bir soruya donusturur. Bu adim
// SADECE arama sorgusunu iyilestirmek icindir; nihai cevabi yazan adim
// (gemini.ts/callLLM, generate() icinde) degismez. Workers AI'daki Qwen
// modeli kullanilir — Gemini kotasindan bagimsiz, ek anahtar gerektirmez,
// zaten fallback icin bu binding aktif.

import { withTimeout } from "../withTimeout";

const CONDENSE_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const CONDENSE_TIMEOUT_MS = 10_000;
// Modelin bağlam penceresi 32.768 token — bu pencere onun çok altında,
// pratikte hiç dolmayacak ama sınırsız da değil (kullanıcıyla karar verildi).
const MAX_HISTORY_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 500;

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

const SYSTEM_PROMPT = `Görevin, bir sohbetteki SON kullanıcı sorusunu, önceki sohbet geçmişine
bakmadan da tek başına tam anlaşılır olacak şekilde yeniden yazmak.

Önemli: "Bağımsız ve anlaşılır" derken sadece dilbilgisi doğruluğu YETMEZ —
soru, hangi konudan/varlıktan bahsettiği açıkça belli olacak şekilde
YENİDEN YAZILMALI. Kısa, eksik referanslı veya tek kelimelik sorular
("ödül ne", "son tarih ne zaman", "kaç kişi") HER ZAMAN geçmişteki en
ilgili konuya göre genişletilmeli, olduğu gibi bırakılmamalı.

Örnek:
Geçmiş:
Kullanıcı: Roket Yarışması'nın başvuru tarihi ne zaman?
Asistan: Başvurular 1 Mart'ta başlıyor.
Son soru: peki son tarih ne
Doğru çıktı: Roket Yarışması'nın başvuru son tarihi ne zaman?

Kurallar:
- Sadece yeniden yazılmış soruyu döndür — başka açıklama, alıntı işareti veya önek ekleme.
- Yanıtın tek bir Türkçe soru/cümle olsun.
- Sohbetin konusunu (ör. hangi yarışma) değiştirme, sadece eksik referansları tamamla.
- Son soru gerçekten hiçbir eksik referans içermiyorsa (ör. zaten yarışma adı geçiyorsa) olduğu gibi bırakabilirsin.`;

function truncate(text: string): string {
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}…` : text;
}

function formatHistory(history: HistoryTurn[]): string {
  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((h) => `${h.role === "user" ? "Kullanıcı" : "Asistan"}: ${truncate(h.text)}`)
    .join("\n");
}

export async function condenseQuestion(ai: Ai, question: string, history: HistoryTurn[]): Promise<string> {
  if (history.length === 0) return question;

  // "/no_think": Qwen3'un uzun "reasoning" fazini atlamasi icin bilinen
  // konvansiyon — thinking ACIKKEN bu adim 30+ saniye surebiliyor (gercek
  // testte olculdu), kabul edilemez derecede yavas. Ilk denemede /no_think
  // + zayif bir talimatla model baglami gormezden gelmisti; asagidaki daha
  // somut/orneklendirilmis SYSTEM_PROMPT ile birlikte tekrar denendi ve hem
  // hizli hem dogru sonuc verdi.
  const prompt = `Sohbet geçmişi:\n${formatHistory(history)}\n\nSon soru: ${question} /no_think`;

  try {
    const result = await withTimeout(
      ai.run(CONDENSE_MODEL, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.1,
      }),
      CONDENSE_TIMEOUT_MS,
      "Soru netleştirme",
    );

    let text: string | undefined;
    if (typeof result === "string") {
      text = result;
    } else if ("choices" in result && result.choices?.[0]) {
      const choice = result.choices[0];
      const message = (choice as { message?: { content?: string } }).message;
      text = message?.content ?? (choice as { text?: string }).text;
    } else if ("response" in result && typeof (result as { response?: unknown }).response === "string") {
      text = (result as { response: string }).response;
    }

    const cleaned = text?.trim().replace(/^["“](.*)["”]$/s, "$1").trim();
    return cleaned || question;
  } catch {
    // Netlestirme basarisiz/zaman asimina ugrarsa orijinal soruyla devam -
    // arama daha once oldugu gibi (baglamsiz) calisir, hicbir sey kirilmaz.
    return question;
  }
}
