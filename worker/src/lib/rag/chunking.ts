// Parcalama (chunking) — backend/local_chunking.py'nin davranissal
// karsiligi. Paragraf sinirinda hedef/hard-limit karakter uzunlugu.
// Referans t3_claudeflare projesinin chunking.ts'inden esinlenilmistir
// (Ek C, bolum 7) — birebir port degil, ayni fikir: paragraf bolunmesi
// + hedef/hard-limit boyut.

import type { ExtractedBlock } from "./extraction";

const TARGET_CHARS = 1500;
const HARD_LIMIT_CHARS = 3000;

export interface Chunk {
  text: string;
  locator: string | null;
}

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= HARD_LIMIT_CHARS) return [paragraph];
  const parts: string[] = [];
  let rest = paragraph;
  while (rest.length > HARD_LIMIT_CHARS) {
    parts.push(rest.slice(0, HARD_LIMIT_CHARS));
    rest = rest.slice(HARD_LIMIT_CHARS);
  }
  if (rest) parts.push(rest);
  return parts;
}

export function chunkBlock(block: ExtractedBlock): Chunk[] {
  const paragraphs = block.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) chunks.push({ text: buffer.trim(), locator: block.locator });
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    for (const piece of splitLongParagraph(paragraph)) {
      if (buffer && buffer.length + piece.length + 2 > TARGET_CHARS) {
        flush();
      }
      buffer = buffer ? `${buffer}\n\n${piece}` : piece;
      if (buffer.length >= HARD_LIMIT_CHARS) flush();
    }
  }
  flush();

  return chunks;
}

export function chunkBlocks(blocks: ExtractedBlock[]): Chunk[] {
  return blocks.flatMap(chunkBlock);
}
