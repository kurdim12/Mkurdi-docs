const CHUNK_SIZE = 1100;
const OVERLAP = 130;
const MIN_CHUNK = 60;

export interface Page {
  page: number;
  text: string;
}

export interface Chunk {
  page: number;
  content: string;
}

/**
 * Normalization is for EMBEDDING INPUT ONLY — stored and displayed text is
 * always the raw transcription. Unifies alef variants, strips tashkeel,
 * collapses whitespace.
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pull `<page n="X">…</page>` blocks out of parsed markdown, in order. */
export function extractPages(md: string): Page[] {
  const pages: Page[] = [];
  const re = /<page\s+n="(\d+)"\s*>([\s\S]*?)<\/page>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const text = (m[2] ?? '').trim();
    if (!text || text === '[unreadable]') continue;
    pages.push({ page: parseInt(m[1] ?? '1', 10), text });
  }
  if (pages.length === 0 && md.trim()) {
    pages.push({ page: 1, text: md.trim() });
  }
  return pages;
}

/** Split an oversize paragraph on sentence marks, hard-splitting any remainder. */
function splitOversize(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_SIZE) return [paragraph];
  const sentences = paragraph.split(/(?<=[.؟!؛])\s+/);
  const packed: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > CHUNK_SIZE) {
      packed.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) packed.push(cur);
  const out: string[] = [];
  for (const p of packed) {
    if (p.length <= CHUNK_SIZE) {
      out.push(p);
    } else {
      for (let i = 0; i < p.length; i += CHUNK_SIZE) out.push(p.slice(i, i + CHUNK_SIZE));
    }
  }
  return out;
}

/**
 * Greedy paragraph packing per page with tail overlap between consecutive
 * chunks. Every chunk keeps the page number it came from.
 */
export function chunkPages(pages: Page[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    const pieces = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap(splitOversize);
    let cur = '';
    for (const piece of pieces) {
      if (cur && cur.length + piece.length + 2 > CHUNK_SIZE) {
        if (cur.trim().length >= MIN_CHUNK) chunks.push({ page, content: cur.trim() });
        const tail = cur.slice(-OVERLAP).trim();
        cur = tail ? `${tail}\n\n${piece}` : piece;
      } else {
        cur = cur ? `${cur}\n\n${piece}` : piece;
      }
    }
    if (cur.trim().length >= MIN_CHUNK) chunks.push({ page, content: cur.trim() });
  }
  return chunks;
}
