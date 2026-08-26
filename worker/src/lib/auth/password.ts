// backend/users.py'nin sifre hash'leme davranisinin karsiligi:
// PBKDF2-HMAC-SHA256, salt 16 byte (hex olarak saklanir), karsilastirma
// sabit-zamanli. Web Crypto API (Workers'ta native).
//
// NOT (FAZ 12'de gercek deploy'da bulundu, kullaniciya bildirildi): orijinal
// Python backend 120_000 iterasyon kullaniyordu; Cloudflare Workers'in
// gercek (canli) crypto.subtle.deriveBits calisma zamani PBKDF2 icin
// 100_000 iterasyon UST SINIRINI zorunlu kiliyor (NotSupportedError firlatir).
// `wrangler dev` bu siniri uygulamadigi icin bu fark FAZ 11'deki testlerde
// yakalanamadi. Platform ile zorunlu bir uyum — 120_000 canlida hicbir
// sekilde calismiyor, bu yuzden izin verilen tavan olan 100_000'e cekildi.
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256; // sha256 digest boyutu — Python hashlib.pbkdf2_hmac varsayilani

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function pbkdf2Hex(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_BITS,
  );
  return bytesToHex(new Uint8Array(derived));
}

export interface PasswordRecord {
  salt: string;
  pw_hash: string;
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const salt = bytesToHex(saltBytes);
  const pw_hash = await pbkdf2Hex(password, salt);
  return { salt, pw_hash };
}

// secrets.compare_digest'in sabit-zamanli karsiligi. Girdiler ayni uzunlukta
// olmadigi sürece (ki gecerli hash'ler her zaman 64 hex karakter) erken
// donmez — timing side-channel'a karsi.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const computed = await pbkdf2Hex(password, record.salt);
  return constantTimeEqual(computed, record.pw_hash);
}
