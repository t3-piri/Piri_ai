// Ayarlar tablosunda (D1) saklanan hassas degerler (ör. Gemini API anahtari)
// duz metin tutulmaz; AES-GCM ile sifrelenir. Anahtar, statik bir Worker
// secret'i olan SETTINGS_ENC_KEY'den (32 byte, base64) gelir — bu secret
// asla UI/DB'ye yazilmaz, yalnizca `wrangler secret put` ile ayarlanir.

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encryptSecret(encKey: string | undefined, plaintext: string): Promise<string> {
  if (!encKey) throw new Error("SETTINGS_ENC_KEY tanımlı değil.");
  const key = await importKey(encKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

export async function decryptSecret(encKey: string | undefined, stored: string): Promise<string> {
  if (!encKey) throw new Error("SETTINGS_ENC_KEY tanımlı değil.");
  const key = await importKey(encKey);
  const combined = base64ToBytes(stored);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
