// backend/local_rag_answer.py _call_gemini()'nin Worker karsiligi.
// google-genai SDK yerine fetch ile Gemini REST API'sine baglanilir
// (Worker ortaminda Python SDK yok) — GEN_MODELS/thinking-strategy/timeout
// mantigi davranissal olarak birebir korunuyor (master prompt karari:
// generation Gemini'de kaliyor, Workers AI'ye gecilmiyor).

import {
  GEN_MODELS,
  GEMINI_TIMEOUT_MS,
  RESPONSE_JSON_SCHEMA,
  WORKERS_AI_RESPONSE_JSON_SCHEMA,
} from "../../config/rag";
import { withTimeout } from "../withTimeout";
import { resolveGeminiApiKey } from "../settings";

const WORKERS_AI_FALLBACK_TIMEOUT_MS = 25_000;

type ThinkingStrategy = "level" | "budget" | "none";
const THINKING_STRATEGIES: ThinkingStrategy[] = ["level", "budget", "none"];

// FAZ 12: siniflandirma artik metne gizli isaret ekleyip tarama yerine
// gercek yapilandirilmis (JSON) cikti ile yapiliyor — bkz. config/rag.ts
// RESPONSE_JSON_SCHEMA notu. response_mime_type/response_schema, Gemini
// REST API'nin (SDK'lardan FARKLI olarak) snake_case alan adlari ve
// UPPERCASE tip adlari bekleyen resmi formati (ai.google.dev/api/generate-content
// dogrulandi, 2026-08).
function generationConfigFor(thinking: ThinkingStrategy) {
  const config: Record<string, unknown> = {
    temperature: 0.2,
    response_mime_type: "application/json",
    response_schema: RESPONSE_JSON_SCHEMA,
  };
  if (thinking === "level") {
    config.thinkingConfig = { thinkingLevel: "MINIMAL" };
  } else if (thinking === "budget") {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

async function callOnce(
  apiKey: string,
  model: string,
  prompt: string,
  systemPrompt: string,
  thinking: ThinkingStrategy,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: generationConfigFor(thinking),
        }),
      },
    );
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
    }
    const data = JSON.parse(body) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) throw new Error("Boş yanıt döndü.");
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGemini(
  apiKey: string,
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  if (!apiKey) throw new Error("GEMINI_API_KEY tanımlı değil.");

  let lastError: unknown = null;
  for (const model of GEN_MODELS) {
    for (const thinking of THINKING_STRATEGIES) {
      try {
        return await callOnce(apiKey, model, prompt, systemPrompt, thinking);
      } catch (err) {
        lastError = err;
        const msg = String(err).toLowerCase();
        // "thinking" veya "invalid_argument" gecmiyorsa (kota/503/zaman
        // asimi gibi gecici bir sorun) kisa bir bekleme sonrasi dogrudan
        // siradaki modele gec — ayni modelin diger thinking stratejilerini
        // denemeye devam etme (orijinaldeki 'break' mantigi).
        if (!msg.includes("thinking") && !msg.includes("invalid_argument")) {
          await sleep(1000);
          break;
        }
      }
    }
  }
  throw new Error(`Üretim başarısız: ${lastError}`);
}

// Kullanıcı kararı (master prompt'un orijinal "generation Gemini'de kalır"
// tercihine bilinçli bir ek): GEMINI_API_KEY yoksa veya Gemini'nin tüm
// GEN_MODELS/thinking denemeleri başarısız olursa, aynı system+user prompt
// sözleşmesiyle Workers AI'ye (@cf/qwen/qwen3-30b-a3b-fp8 — referans
// t3_claudeflare projesinde de generation için doğrulanmış model, Ek C
// bölüm 6) düşülür. Aynı yapılandırılmış JSON sözleşmesi (bkz.
// config/rag.ts StructuredAnswer) bu modelin çıktısına da uygulanır
// (generate() içinde ortak ayrıştırma, answerEngine.ts).
//
// Ek C'deki bulgu: bu "thinking"/reasoning modeli dar bir max_tokens
// bütçesinde tüm bütçeyi akıl yürütmeye harcayıp content:null dönebiliyor
// — bu yüzden geniş bir bütçe (1200) kullanılıyor.
const WORKERS_AI_FALLBACK_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

export async function callWorkersAiFallback(
  ai: Ai,
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const result = await withTimeout(
    ai.run(WORKERS_AI_FALLBACK_MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200,
      temperature: 0.2,
      // Cloudflare dokumantasyonu dogrulandi (workers-ai/json-mode/): bu
      // alan Gemini'den farkli olarak standart kucuk-harfli JSON Schema'nin
      // KENDISI, "schema" alt-alanina sarilmiyor.
      response_format: { type: "json_schema", json_schema: WORKERS_AI_RESPONSE_JSON_SCHEMA },
    }),
    WORKERS_AI_FALLBACK_TIMEOUT_MS,
    "Workers AI yedek modeli",
  );
  if (typeof result === "string") return result.trim();
  if ("choices" in result && result.choices?.[0]) {
    const choice = result.choices[0];
    const message = (choice as { message?: { content?: string } }).message;
    const text = message?.content ?? (choice as { text?: string }).text;
    if (text) return text.trim();
  }
  throw new Error("Workers AI yedek modeli boş yanıt döndü.");
}

// Gemini -> basarisizsa Workers AI yedegi. Ikisi de basarisiz olursa
// generate()'deki 'technical_error' dalina duser.
// Kullanilacak anahtar admin panelinden (D1, sifreli) veya yoksa deploy
// secret'indan (GEMINI_API_KEY) resolveGeminiApiKey ile cozulur — bkz.
// lib/settings.ts. Admin panelden bilincli "devre disi" birakildiysa
// dogrudan Workers AI'ye gecilir.
export async function callLLM(
  env: { GEMINI_API_KEY?: string; SETTINGS_ENC_KEY?: string; AI: Ai; DB: D1Database },
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const apiKey = await resolveGeminiApiKey(env.DB, env);
  if (apiKey) {
    try {
      return await callGemini(apiKey, prompt, systemPrompt);
    } catch {
      // Gemini basarisiz oldu, Workers AI yedegine dus (asagida).
    }
  }
  return callWorkersAiFallback(env.AI, prompt, systemPrompt);
}
