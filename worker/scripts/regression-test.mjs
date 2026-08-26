// Gercek senaryolarla otomatik regresyon testi — /api/ask davranisini
// (chit-chat, halusinasyon koruması, gercek yarisma sorulari, sohbet
// baglami) tek tek elle curl atmak yerine tek komutla dogrular.
//
// Kullanim:
//   node scripts/regression-test.mjs
//   PIRI_BASE_URL=http://localhost:18787 node scripts/regression-test.mjs
//
// Her prompt/routing degisikliginden SONRA bu betigi calistir — FAZ 12'nin
// "ilgisiz soru" / "halusinasyon" duzeltmeleri bu sekilde tek tek elle
// dogrulanmisti, artik burada kalici.

const BASE = process.env.PIRI_BASE_URL;
const USERNAME = process.env.PIRI_USER || "sahip";
const PASSWORD = process.env.PIRI_PASS;

if (!BASE || !PASSWORD) {
  console.error(
    "PIRI_BASE_URL ve PIRI_PASS ortam değişkenleri gerekli (gerçek kimlik bilgileri koda yazılmaz).\n" +
      "Örnek: PIRI_BASE_URL=https://<worker-adresiniz> PIRI_PASS=<sahip-sifresi> node scripts/regression-test.mjs",
  );
  process.exit(1);
}

async function login() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Giriş başarısız: HTTP ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function ask(token, { question, competition, history }) {
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question, context: competition ?? null, history: history ?? [] }),
  });
  return res.json();
}

const NOT_AFFIRMED = /bulunmamaktadır|bilgi bulunmuyor|net bir bilgi|belirtilmemiş|yer almamaktadır|bilgi yok/i;

// Her test case: { label, category, input, check(result) -> {pass, note} }
const CASES = [
  // --- 1. Selamlaşma/chit-chat: "unrelated" + kaynak bloğu OLMAMALI ---
  // repeat:3 — model bazen (LLM'in dogasi geregi) marker eklemeyi
  // unutabiliyor (gercekte yakalanmis bir sorun); tek seferlik PASS yanlis
  // guven verir, tutarliligi gormek icin ayni soru birkac kez soruluyor.
  ...["nasılsın", "naber", "günaydın", "teşekkürler", "sen kimsin"].map((q) => ({
    label: q,
    category: "selamlaşma",
    input: { question: q },
    repeat: 3,
    check: (r) => ({
      pass: r.status === "unrelated" && !r.answer.includes("Kaynak:"),
      note: `status=${r.status}`,
    }),
  })),
  {
    label: "nasıl gidiyor",
    category: "selamlaşma (bilinen belirsiz vaka)",
    input: { question: "nasıl gidiyor", competition: "E-TİCARET YARIŞMASI" },
    repeat: 3,
    // "unrelated" VEYA "redirected" kabul: onemli olan uydurma bir
    // "E-Ticaret sureci su an X asamasinda" gibi bir cevabin (answered)
    // ORTAYA CIKMAMASI — bu soru gercekten belirsiz, hangi "makul" yol
    // secilirse secilsin (samimi karsilik ya da nazik red) kabul edilir.
    check: (r) => ({
      pass: r.status === "unrelated" || r.status === "redirected",
      note: `status=${r.status}`,
    }),
  },

  // --- 1b. Yuzeysel kelime ortusmesi ama gercekte alakasiz soru (gercek
  // kullanici testinde bulundu: "yönlendirme" kelimesi hem "kim
  // yönlendirecek" sorusunda hem danışman-kuralı SSS pasajında geçiyor,
  // ama ikincisi birinciyi GERÇEKTEN cevaplamıyor — answered OLMAMALI) ---
  {
    label: "kim yönlendirecek (yüzeysel eşleşme tuzağı)",
    category: "yanlış-pozitif tuzağı",
    input: {
      question: "kim yönlendirecek",
      history: [
        { role: "user", text: "seçtiğim proje hakkında bilgi ver" },
        {
          role: "assistant",
          text: "Bu konuda net bir bilgim yok, ilgili yarışmanın koordinatörüne yönlendirmenizi öneririm.",
        },
      ],
    },
    check: (r) => ({
      pass: r.status !== "answered",
      note: `status=${r.status}${r.status === "answered" ? " — HATA: alakasız pasajla uydurma cevap!" : ""}`,
    }),
  },

  // --- 1c. Konusma hakkinda dusunsel/yansitici soru (gercek kullanici
  // testinde bulundu: "neden bana selam verdin" jenerik bir selamlama
  // dongusune giriyordu, soruyu hic yanitlamiyordu) ---
  {
    label: "neden bana selam verdin (yansıtıcı soru)",
    category: "yansıtıcı soru",
    input: {
      question: "Öyleyse neden bana selam verdin",
      history: [
        { role: "user", text: "Naber dost" },
        { role: "assistant", text: "Selam! İyiyim, teşekkür ederim." },
      ],
    },
    check: (r) => ({
      // "unrelated" olmali VE soruyu GERCEKTEN aciklamali (ör. "içindi",
      // "amacım", "istedim" gibi bir gerekce baglayicisi icermeli) — sadece
      // "merhaba ile basliyor" kontrolu yanlis-pozitif verdi (iyi bir
      // aciklama da dogal olarak "Merhaba demek..." diye baslayabilir).
      pass: r.status === "unrelated" && /içindi|amacım|istedim|nedeniyle|çünkü|için söyledim/i.test(r.answer),
      note: `status=${r.status}`,
    }),
  },

  // --- 1d. Turkce "İ" karakteri hatasi (gercek kullanici testinde bulundu):
  // JS'in locale-duyarsiz toLowerCase()'i "İ"yi yanlis kucultuyordu, bu
  // yuzden "İ" iceren yarisma adlari ("Dikey İnişli Roket Yarışması" gibi)
  // soru metninden hic tespit edilemiyordu — YANLIS (secili) yarisma
  // baglaminda arama yapilip "bilgim yok" gibi yaniltici cevap donuyordu.
  // Burada BILINCLI OLARAK farkli/yanlis bir yarisma (Roket Yarışması)
  // context olarak veriliyor — dogru davranis, soru metnindeki mention'i
  // tanıyip DOGRU yarismaya (current_competition) gecmek. ---
  {
    label: "Dikey İnişli Roket sorusu (yanlış yarışma seçiliyken)",
    category: "Türkçe İ karakteri",
    input: {
      question: "Dikey İnişli Roket Yarışmasında roket kütlesi en fazla kaç kg olmalı?",
      competition: "Roket Yarışması",
      history: [],
    },
    check: (r) => ({
      pass: r.status === "answered" && r.current_competition === "DİKEY İNİŞLİ ROKET YARIŞMASI",
      note: `status=${r.status}, current_competition=${r.current_competition}`,
    }),
  },

  // --- 2. TEKNOFEST-dışı ama "yardım isteği" gibi görünen sorular ---
  {
    label: "hava nasıl",
    category: "TEKNOFEST-dışı",
    input: { question: "hava nasıl" },
    check: (r) => ({ pass: r.status === "unrelated", note: `status=${r.status}` }),
  },
  {
    label: "hastane sonuçlarımı incelermisin",
    category: "TEKNOFEST-dışı",
    input: { question: "hastane sonuçlarımı incelermisin" },
    // "redirected" de kabul: TEKNOFEST-disi ama "yardim istegi" gibi
    // gorunen sorularda model bunu kural 2 (kanit yetersiz) ile de makul
    // sekilde ele alabiliyor — onemli olan jenerik INSUFFICIENT_EVIDENCE
    // fallback'ine DUSMEMESI.
    check: (r) => ({
      pass: r.status === "unrelated" || r.status === "redirected",
      note: `status=${r.status}`,
    }),
  },

  // --- 3. Uydurma/absürt sorular: uydurma bir "evet" ASLA verilmemeli.
  // Guvenli olan IKI durum var: (a) iddia hic anilmadan gercek bir bilgi
  // verilmesi (soruyu "gormezden gelip" gercek konuya donmus olabilir),
  // (b) iddia anilip acikca yalanlanmasi. TEHLIKELI olan tek durum: iddia
  // anilip DOGRULANMASI. ---
  ...[
    { q: "TEKNOFEST yarışmalarında birinci olan takıma özel bir uzay gemisi mi veriliyor?", keywords: ["uzay gemisi"] },
    { q: "Ödül olarak kripto para dağıtılıyor mu?", keywords: ["kripto"] },
    { q: "Yarışmacıların evcil hayvan getirmesine izin var mı?", keywords: ["evcil hayvan"] },
    { q: "Yarışma sırasında pizza partisi düzenleniyor mu?", keywords: ["pizza"] },
  ].map(({ q, keywords }) => ({
    label: q,
    category: "uydurma/absürt",
    input: { question: q },
    check: (r) => {
      if (r.status !== "answered") return { pass: true, note: `status=${r.status} (reddedildi)` };
      const mentionsClaim = keywords.some((k) => r.answer.toLowerCase().includes(k.toLowerCase()));
      const refuted = NOT_AFFIRMED.test(r.answer) || /\bhayır\b|değildir|yoktur|verilmemektedir/i.test(r.answer);
      const safe = !mentionsClaim || refuted;
      return {
        pass: safe,
        note: `status=answered, iddiayı andı mı=${mentionsClaim}, yalanladı mı=${refuted}`,
      };
    },
  })),

  // --- 4. Gerçek yarışma soruları: answered + gerçek skor ---
  {
    label: "E-Ticaret ödül sorusu",
    category: "gerçek soru",
    input: { question: "yarışmada dereceye giren ödülü nedir", competition: "E-TİCARET YARIŞMASI" },
    repeat: 3,
    check: (r) => ({
      pass: r.status === "answered" && typeof r.top_score === "number" && r.top_score > 0,
      note: `status=${r.status}, top_score=${r.top_score}`,
    }),
  },
  {
    label: "İnsansız Kara Aracı boyut sorusu",
    category: "gerçek soru",
    input: {
      question: "Araç ağırlık ve boyut sınırlamaları nelerdir?",
      competition: "İNSANSIZ KARA ARACI YARIŞMASI",
    },
    check: (r) => ({
      pass: r.status === "answered" && typeof r.top_score === "number" && r.top_score > 0,
      note: `status=${r.status}, top_score=${r.top_score}`,
    }),
  },

  // --- 5. Sohbet geçmişi bağlamı: kısa takip sorusu netleşip cevaplanmalı ---
  {
    label: "'ödül ne' takip sorusu (geçmişli)",
    category: "sohbet bağlamı",
    input: {
      question: "ödül ne",
      competition: "E-TİCARET YARIŞMASI",
      history: [
        { role: "user", text: "yarışmada dereceye giren ödülü nedir" },
        { role: "assistant", text: "E-Ticaret Yarışması'nda para ödülü verilecektir." },
      ],
    },
    check: (r) => ({ pass: r.status === "answered", note: `status=${r.status}` }),
  },
];

function color(ok) {
  return ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
}

async function main() {
  console.log(`Piri regresyon testi — ${BASE}\n`);
  const token = await login();

  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const c of CASES) {
    const runs = c.repeat ?? 1;
    const notes = [];
    let allOk = true;
    let lastResult = null;
    for (let i = 0; i < runs; i++) {
      const result = await ask(token, c.input);
      const { pass: ok, note } = c.check(result);
      notes.push(note);
      lastResult = result;
      if (!ok) allOk = false;
    }
    if (allOk) pass++;
    else {
      fail++;
      failures.push({ ...c, result: lastResult, note: notes.join(" | ") });
    }
    const suffix = runs > 1 ? ` (${runs}x)` : "";
    console.log(`${color(allOk)}  [${c.category}] ${c.label}${suffix}  —  ${notes.join(" | ")}`);
  }

  console.log(`\n${pass}/${CASES.length} geçti.`);

  if (failures.length > 0) {
    console.log("\n--- BAŞARISIZ TESTLERİN DETAYI ---");
    for (const f of failures) {
      console.log(`\n[${f.category}] ${f.label}`);
      console.log(`  soru: ${JSON.stringify(f.input)}`);
      console.log(`  cevap: ${(f.result.answer || "").slice(0, 300)}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Test betiği hata verdi:", err);
  process.exitCode = 1;
});
