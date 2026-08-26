// Metin cikarma — backend/local_loaders.py'nin Worker karsiligi.
//
// ZORUNLU DEGISIKLIK (kullaniciya bildirildi, CLOUDFLARE_MIGRATION_ILERLEME.md'de
// kayitli): orijinal pypdf/python-docx/python-pptx/openpyxl Workers'ta
// calisamaz. Referans t3_claudeflare projesinde dogrulanmis tek alternatif:
// Workers AI'nin ai.toMarkdown() ozelligi (Ek C, bolum 7). PDF/HTML/resim
// icin dogrulanmis; DOCX/PPTX icin de calistigi bildiriliyor (o projede
// gercek dosyalarla test edilmis).
//
// toMarkdown() PDF sayfa sinirlarini "### Page N" satirlariyla isaretler —
// bu locator (hangi sayfadan geldigi) bilgisinin kaynagi.

export interface ExtractedBlock {
  text: string;
  locator: string | null; // orn. "Sayfa 3", "Slayt 2", "Satır 15" — orijinaldeki gibi
}

const PAGE_MARKER = /^#{1,3}\s*Page\s+(\d+)\s*$/im;

export async function extractMarkdown(
  ai: Ai,
  file: { name: string; blob: Blob },
): Promise<string> {
  const [doc] = await ai.toMarkdown([file]);
  if (!doc || doc.format === "error") {
    throw new Error(`Belge metne çevrilemedi: ${file.name}${doc ? ` (${doc.error})` : ""}`);
  }
  return doc.data;
}

// Markdown'i "### Page N" isaretleyicilerine gore sayfa bloklarina ayirir.
// Isaretleyici yoksa (tek sayfalik/duz metin) tum icerik tek blok olur,
// locator null (orijinaldeki gibi: bazi kaynak tiplerinde sayfa kavrami yok).
export function splitByPageMarkers(markdown: string): ExtractedBlock[] {
  const lines = markdown.split("\n");
  const blocks: ExtractedBlock[] = [];
  let currentLocator: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text) blocks.push({ text, locator: currentLocator });
    currentLines = [];
  };

  for (const line of lines) {
    const match = line.match(PAGE_MARKER);
    if (match) {
      flush();
      currentLocator = `Sayfa ${match[1]}`;
      continue;
    }
    currentLines.push(line);
  }
  flush();

  if (blocks.length === 0) {
    return [{ text: markdown.trim(), locator: null }];
  }
  return blocks;
}
