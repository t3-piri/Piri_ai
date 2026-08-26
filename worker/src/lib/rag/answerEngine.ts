// backend/local_rag_answer.py'nin answer_question/answer_in_context/
// answer_auto/_try_general/_try_competition/_generate/_finalize
// zincirinin birebir davranissal portu. CLOUDFLARE_MIGRATION_MASTER_PROMPT.md
// Ek A, bolum 4.

import { searchGeneral, searchCompetition, type SearchHit } from "./search";
import { callLLM } from "./gemini";
import { looksLikeGibberish, reportsLiveProblem } from "./gibberish";
import { detectCompetitionMention } from "../../routes/competitions";
import { logTurn } from "../qaLog";
import {
  GENERAL_LABEL,
  SCORE_THRESHOLD,
  LOW_EVIDENCE_HINT_THRESHOLD,
  SUPPORT_CONTACT,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  GENERAL_SYSTEM_PROMPT,
  competitionSystemPrompt,
  formatConfidence,
  type StructuredAnswer,
} from "../../config/rag";

export interface AnswerResult {
  answer: string;
  status: string;
  confidence: string | null;
  top_score: number | null;
  sources: SearchHit[];
  current_competition?: string | null;
  flagged?: boolean;
  log_id?: number;
}

function formatSourcesBlock(hits: SearchHit[]): string {
  const locatorsByFile = new Map<string, string[]>();
  for (const h of hits) {
    const file = h.metadata.file;
    if (!locatorsByFile.has(file)) locatorsByFile.set(file, []);
    const locator = h.metadata.locator;
    if (locator && !locatorsByFile.get(file)!.includes(locator)) {
      locatorsByFile.get(file)!.push(locator);
    }
  }
  const lines: string[] = [];
  for (const [file, locators] of locatorsByFile) {
    lines.push(
      locators.length > 0 ? `Kaynak: [${file}] (${locators.join(", ")})` : `Kaynak: [${file}]`,
    );
  }
  return lines.join("\n");
}

function formatContext(hits: SearchHit[]): string {
  return hits
    .map((h, i) => {
      const citation = `${h.metadata.competition || h.metadata.category} – ${h.metadata.file}, ${h.metadata.locator ?? ""}`;
      return `[${i + 1}] (Kaynak: ${citation})\n${h.text}`;
    })
    .join("\n\n");
}

async function generate(
  env: Ctx,
  question: string,
  hits: SearchHit[],
  maxDenseScore: number,
  systemPrompt: string,
  outOfScopeCheck: boolean,
): Promise<AnswerResult> {
  const context = formatContext(hits);
  // Skor esigi (SCORE_THRESHOLD) genel havuzda artik sert bir on-filtre
  // degil (bkz. tryGeneral notu) — bunun yerine dusuk skorlu durumlarda
  // modele somut bir ipucu veriliyor, "kural 1'i uygulama" talimatinin
  // salt metinsel agirligina guvenmek yerine (bkz. config/rag.ts,
  // LOW_EVIDENCE_HINT_THRESHOLD notu).
  const evidenceHint =
    maxDenseScore < LOW_EVIDENCE_HINT_THRESHOLD
      ? `\n\n[SİSTEM NOTU: Bu kaynak pasajların soruyla benzerlik skoru DÜŞÜK (${maxDenseScore.toFixed(2)}/1.00) — büyük olasılıkla sadece yüzeysel bir kelime örtüşmesi var, sorunun gerçek/doğrudan cevabı DEĞİLLER. Kural 1'i uygulamadan önce ekstra dikkatli ol; emin değilsen kural 2 veya 3'ü tercih et.]`
      : "";
  const prompt = `Yarışmacı sorusu: ${question}\n\nKaynak pasajlar:\n${context}${evidenceHint}\n\nYukarıdaki kurallara uyarak yanıtla.`;

  let parsed: StructuredAnswer;
  try {
    const raw = await callLLM(env, prompt, systemPrompt);
    parsed = JSON.parse(raw) as StructuredAnswer;
    if (!parsed || typeof parsed.classification !== "string" || typeof parsed.response !== "string") {
      throw new Error("Beklenmeyen JSON şekli.");
    }
  } catch {
    // LLM cagrisi basarisiz (kota/503/zaman asimi) YA DA model semaya
    // uymayan/gecersiz JSON dondurdu — ikisi de kanit yetersizligi DEGIL,
    // teknik aksaklik. Asagidaki metin eslesmesiyle ("redirected")
    // karismasin diye status burada sabitlenir.
    return {
      answer: `Şu anda teknik bir sorun nedeniyle yanıt üretemiyorum, ${SUPPORT_CONTACT} yönlendirmenizi öneririm.`,
      status: "technical_error",
      confidence: formatConfidence(maxDenseScore),
      top_score: maxDenseScore,
      sources: hits,
    };
  }

  const flagged = parsed.flagged === true;

  // FAZ 12: siniflandirma artik metne gizli isaret ekleyip tarama yerine
  // modelin dogrudan dondurdugu "classification" alanindan okunuyor —
  // API tarafindan semaya uygunlugu ZORLANIYOR (Gemini response_schema),
  // "model isareti unuttu" turu hatalar yapisal olarak imkansiz hale geldi
  // (eskiden "günaydın"/"nasıl gidiyor" sorularinda defalarca gozlemlenen
  // gercek bir siniflandirma hatasiydi, bkz. ilerleme dosyasi).
  let status: string;
  let answer: string;
  if (outOfScopeCheck && parsed.classification === "out_of_scope") {
    status = "out_of_scope";
    answer = parsed.response;
  } else if (!outOfScopeCheck && parsed.classification === "unrelated") {
    status = "unrelated";
    answer = parsed.response;
  } else if (parsed.classification === "insufficient_evidence") {
    status = "redirected";
    answer = parsed.response;
  } else if (parsed.classification === "answered") {
    status = "answered";
    answer = `${parsed.response}\n\n${formatSourcesBlock(hits)}\nGüven seviyesi: ${formatConfidence(maxDenseScore)}`;
  } else {
    // Beklenmeyen/karisik classification degeri (ör. genel havuzda
    // "out_of_scope" veya yarisma-ozel promptta "unrelated" donmesi) —
    // guvenli varsayilan: yetersiz kanit olarak ele al, uydurma cevap
    // gostermemek onceliklidir.
    status = "redirected";
    answer = parsed.response || `Bu konuda net bir bilgi bulamadım, ${SUPPORT_CONTACT} yönlendirmenizi öneririm.`;
  }

  // Kod seviyesinde deterministik guvenlik agi: prompt'taki "dusuk skorda
  // supheci ol" ipucu (evidenceHint) TEK BASINA yeterince guvenilir
  // cikmadi — gercek testte ayni soru bazen dogru (redirected) bazen
  // yanlis (answered, uydurma cevap) siniflandirildi. Model "answered"
  // dediginde bile, dense skor cok dusukse (tryCompetition icin bu asla
  // tetiklenmez — orada maxDenseScore zaten SCORE_THRESHOLD'un ustunde
  // olmadan generate() hic cagrilmiyor) bu iddiaya guvenilmiyor, kod
  // zorla "redirected"e ceviriyor.
  if (status === "answered" && maxDenseScore < LOW_EVIDENCE_HINT_THRESHOLD) {
    status = "redirected";
    answer = `Bu konuda net bir bilgi bulamadım, ${SUPPORT_CONTACT} yönlendirmenizi öneririm.`;
  }

  return {
    answer,
    status,
    confidence: formatConfidence(maxDenseScore),
    top_score: maxDenseScore,
    sources: hits,
    flagged,
  };
}

interface Ctx {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  GEMINI_API_KEY?: string;
  SETTINGS_ENC_KEY?: string;
}

async function tryGeneral(env: Ctx, question: string): Promise<AnswerResult | null> {
  const { hits, maxDenseScore } = await searchGeneral(env.DB, env.VECTORIZE, env.AI, question);
  // Skor esigi ONCEDEN burada sorguyu modele hic gondermeden reddediyordu.
  // Sorun: Vectorize her zaman "en yakin" komsuları donduruyor (alakasiz
  // sorularda bile hits BOS OLMUYOR, sadece skor dusuk oluyor) — yani bu
  // esik aslinda "gercekten ilgisiz mi" sorusunu degil, "zayif eslesme mi"
  // sorusunu cevapliyordu. Bu da "nasılsın"/"hava nasıl" gibi soruların,
  // GENERAL_SYSTEM_PROMPT'taki ozel olarak bu durum icin yazilmis 3. kurala
  // (hicbir zaman ulasmadan) jenerik INSUFFICIENT_EVIDENCE_MESSAGE almasina
  // yol aciyordu. Kullanici onayiyla (bkz. ilerleme dosyasi) esik kaldirildi
  // — ayrim artik modelin kendisine (kural 2: yetersiz kanit / kural 3:
  // alakasiz) birakiliyor. tryCompetition'daki esik BILINCLI OLARAK
  // DOKUNULMADI — yarisma-ozel gercek sorularda halusinasyon riskine karsi
  // ana savunma hatti orada kaliyor.
  const result = await generate(
    env,
    question,
    hits,
    maxDenseScore,
    GENERAL_SYSTEM_PROMPT,
    false,
  );
  // "redirected" de kabul listesine eklendi: skor esigi kalkinca, TEKNOFEST
  // disi ama "yardim istegi" gibi gorunen sorularda (ör. "hastane
  // sonuclarimi incelermisin") model bunu "tamamen alakasiz" (kural 3)
  // yerine "kanit yetersiz" (kural 2) sayabiliyor — kabul edilmezse bu
  // gercek LLM yaniti sessizce atilip jenerik INSUFFICIENT_EVIDENCE_MESSAGE'a
  // duserdi (gercek testte gozlemlendi). Ikisi de kullaniciya makul bir
  // yanit oldugu icin artik kabul ediliyor.
  return ["answered", "technical_error", "unrelated", "redirected"].includes(result.status)
    ? result
    : null;
}

async function tryCompetition(
  env: Ctx,
  question: string,
  competition: string,
): Promise<AnswerResult | null> {
  const { hits, maxDenseScore } = await searchCompetition(
    env.DB,
    env.VECTORIZE,
    env.AI,
    question,
    competition,
  );
  if (hits.length === 0 || maxDenseScore < SCORE_THRESHOLD) return null;
  const result = await generate(
    env,
    question,
    hits,
    maxDenseScore,
    competitionSystemPrompt(competition),
    true,
  );
  return ["answered", "technical_error"].includes(result.status) ? result : null;
}

async function finalize(
  env: Ctx,
  question: string,
  result: AnswerResult | null,
  competitionLabel: string | null,
  currentCompetition: string | null,
): Promise<AnswerResult> {
  const finalResult: AnswerResult = result ?? {
    answer: INSUFFICIENT_EVIDENCE_MESSAGE,
    status: "low_confidence",
    confidence: null,
    top_score: null,
    sources: [],
  };

  const flagged = (finalResult.flagged ?? false) || reportsLiveProblem(question);

  const logId = await logTurn(env.DB, {
    competition: competitionLabel,
    question,
    answer: finalResult.answer,
    status: finalResult.status,
    topScore: finalResult.top_score !== null ? Math.round(finalResult.top_score * 10000) / 10000 : null,
    flagged,
  });
  finalResult.log_id = logId;

  finalResult.current_competition = currentCompetition;
  finalResult.flagged = flagged;
  return finalResult;
}

// answer_question()'un birebir karsiligi — bkz. orijinal docstring
// (backend/local_rag_answer.py) icin tam yonlendirme mantigi aciklamasi.
export async function answerQuestion(
  env: Ctx,
  question: string,
  currentCompetition: string | null,
): Promise<AnswerResult> {
  const mentioned = await detectCompetitionMention(env.DB, question);

  if (mentioned) {
    const result = (await tryCompetition(env, question, mentioned)) ?? (await tryGeneral(env, question));
    return finalize(env, question, result, mentioned, mentioned);
  }

  const generalResult = await tryGeneral(env, question);
  if (generalResult) {
    return finalize(env, question, generalResult, GENERAL_LABEL, currentCompetition);
  }

  if (currentCompetition === null) {
    if (looksLikeGibberish(question)) {
      return finalize(
        env,
        question,
        {
          answer:
            "Sorunuzu tam olarak anlayamadım. TEKNOFEST yarışmalarıyla ilgili sorunuzu biraz daha açık yazar mısınız?",
          status: "unclear",
          confidence: null,
          top_score: null,
          sources: [],
        },
        GENERAL_LABEL,
        null,
      );
    }
    return finalize(
      env,
      question,
      {
        answer: "Bu sorunuz hangi yarışmayla ilgili?",
        status: "needs_competition",
        confidence: null,
        top_score: null,
        sources: [],
      },
      GENERAL_LABEL,
      null,
    );
  }

  const result = await tryCompetition(env, question, currentCompetition);
  return finalize(env, question, result, currentCompetition, currentCompetition);
}

// answer_in_context()'in birebir karsiligi.
export async function answerInContext(
  env: Ctx,
  question: string,
  context: string | null,
  includeGeneral = true,
): Promise<AnswerResult> {
  if (!context || context === GENERAL_LABEL) {
    return finalize(env, question, await tryGeneral(env, question), GENERAL_LABEL, null);
  }

  let result = await tryCompetition(env, question, context);
  if (result === null && includeGeneral) {
    result = await tryGeneral(env, question);
  }
  return finalize(env, question, result, context, context);
}

// answer_auto()'nun birebir karsiligi — /api/ask bunu kullanir.
export async function answerAuto(
  env: Ctx,
  question: string,
  selectedCompetition: string | null,
): Promise<AnswerResult> {
  const mentioned = await detectCompetitionMention(env.DB, question);
  if (mentioned) {
    return answerInContext(env, question, mentioned);
  }
  if (selectedCompetition) {
    return answerInContext(env, question, selectedCompetition);
  }
  return answerQuestion(env, question, null);
}
