// backend/web_app.py _validate_avatar()'in birebir karsiligi: uzanti +
// "sihirli bayt" (magic bytes) ikisi de dogrulanir.

const AVATAR_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

const SIGNATURES: Record<string, number[][]> = {
  ".png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".webp": [[0x52, 0x49, 0x46, 0x46]], // "RIFF" — asagida ayrica "WEBP" kontrolu
  ".gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
};

function matchesSignature(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

export class AvatarValidationError extends Error {
  status = 400;
}

export function validateAvatar(filename: string, content: Uint8Array): string {
  const ext = "." + (filename.split(".").pop() ?? "").toLowerCase();
  const signatures = SIGNATURES[ext];
  if (!signatures) {
    throw new AvatarValidationError(
      `Desteklenmeyen resim türü. İzin verilenler: ${Object.keys(SIGNATURES).sort().join(", ")}`,
    );
  }
  if (content.length === 0) {
    throw new AvatarValidationError("Dosya boş.");
  }
  if (content.length > AVATAR_MAX_BYTES) {
    throw new AvatarValidationError("Dosya 3 MB'tan büyük olamaz.");
  }
  if (!signatures.some((sig) => matchesSignature(content, sig))) {
    throw new AvatarValidationError("Dosya içeriği beklenen resim biçimiyle uyuşmuyor.");
  }
  if (ext === ".webp") {
    const head = new TextDecoder("latin1").decode(content.slice(0, 16));
    if (!head.includes("WEBP")) {
      throw new AvatarValidationError("Dosya içeriği beklenen resim biçimiyle uyuşmuyor.");
    }
  }
  return ext;
}
