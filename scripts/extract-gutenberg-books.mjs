/**
 * Rebuilds bundled novel JSON from the six HTML editions linked by Project Gutenberg
 * eBook #31100 ("The Complete Works of Jane Austen" — a linked index; the novels
 * themselves are the linked -h.htm files below).
 *
 * @see https://www.gutenberg.org/files/31100/31100-h/31100-h.htm
 */
import * as cheerio from "cheerio";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PG_INDEX_31100 =
  "https://www.gutenberg.org/files/31100/31100-h/31100-h.htm";

const BOOKS = [
  {
    id: "persuasion",
    slug: "persuasion",
    title: "Persuasion",
    url: "https://www.gutenberg.org/files/105/105-h/105-h.htm",
  },
  {
    id: "northanger-abbey",
    slug: "northanger-abbey",
    title: "Northanger Abbey",
    url: "https://www.gutenberg.org/files/121/121-h/121-h.htm",
  },
  {
    id: "mansfield-park",
    slug: "mansfield-park",
    title: "Mansfield Park",
    url: "https://www.gutenberg.org/files/141/141-h/141-h.htm",
  },
  {
    id: "emma",
    slug: "emma",
    title: "Emma",
    url: "https://www.gutenberg.org/files/158/158-h/158-h.htm",
  },
  {
    id: "pride-and-prejudice",
    slug: "pride-and-prejudice",
    title: "Pride and Prejudice",
    url: "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm",
  },
  {
    id: "sense-and-sensibility",
    slug: "sense-and-sensibility",
    title: "Sense and Sensibility",
    url: "https://www.gutenberg.org/files/21839/21839-h/21839-h.htm",
  },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data", "books");

/**
 * Match a chapter line at the end of an h2 (illustrated P&P puts captions before the heading).
 * Some PG pages omit the space ("CHAPTERXXVII.").
 */
const CHAPTER_TAIL = /(CHAPTER\s*(?:[IVXLCDM]+|\d+))\s*\.?\s*$/i;

function sliceGutenbergBody(html) {
  const start = html.indexOf("*** START OF");
  const end = html.indexOf("*** END OF");
  if (start === -1 || end === -1 || end <= start) return html;
  return html.slice(start, end);
}

function paragraphText($, pEl) {
  const $clone = $(pEl).clone();
  $clone.find(".pagenum").remove();
  return $clone.text().replace(/\s+/g, " ").trim();
}

function isTrivial(t) {
  if (!t || t.length < 2) return true;
  if (/^[\d{}\s—\-–]+$/u.test(t) && t.length < 30) return true;
  return false;
}

/** Avoid single <p> taller than the reader viewport (pagination is one block = one page slot). */
const MAX_PARAGRAPH_CHARS = 1000;
const MIN_SPLIT_CHUNK = 100;

function looksLikeAbbrevPeriod(text, dotIdx) {
  const tail = text.slice(Math.max(0, dotIdx - 10), dotIdx + 1);
  return /\b(Mr|Mrs|Ms|Dr|St|Vol)\.$/i.test(tail);
}

/** Unclosed “ depth so we can mark mid–speech continuations for the reader. */
function curlyQuoteDepth(str) {
  let d = 0;
  for (const c of str) {
    if (c === "\u201c") d++;
    else if (c === "\u201d") d = Math.max(0, d - 1);
  }
  return d;
}

/**
 * Split `text` into multiple paragraphs at sentence boundaries so each piece is ≤ maxLen.
 * Falls back to the last space in-range, then a hard cut, so progress is always guaranteed.
 * @returns {(string|{text:string,c:true})[]}
 */
function splitLongParagraph(text, maxLen = MAX_PARAGRAPH_CHARS) {
  const s = text.trim().replace(/\s+/g, " ");
  if (s.length <= maxLen) return [s];

  const out = [];
  let start = 0;

  while (start < s.length) {
    if (s.length - start <= maxLen) {
      const tail = s.slice(start).trim();
      if (tail) {
        const depth = curlyQuoteDepth(s.slice(0, start));
        out.push(out.length > 0 && depth > 0 ? { text: tail, c: true } : tail);
      }
      break;
    }

    const maxPos = Math.min(start + maxLen, s.length);
    let splitAt = -1;

    for (let i = maxPos - 1; i >= start + MIN_SPLIT_CHUNK; i--) {
      const ch = s[i];
      if (ch !== "." && ch !== "?" && ch !== "!") continue;
      if (ch === "." && looksLikeAbbrevPeriod(s, i)) continue;

      let j = i + 1;
      while (j < s.length && /[''""\u2018\u2019\u201c\u201d]/.test(s[j])) j++;
      if (j >= s.length || !/\s/.test(s[j])) continue;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j <= maxPos) {
        splitAt = j;
        break;
      }
    }

    if (splitAt === -1) {
      for (let i = maxPos - 1; i >= start + MIN_SPLIT_CHUNK; i--) {
        if (s[i] === " ") {
          splitAt = i + 1;
          break;
        }
      }
    }

    if (splitAt === -1 || splitAt <= start) splitAt = maxPos;

    const piece = s.slice(start, splitAt).trim();
    if (piece) {
      const depth = curlyQuoteDepth(s.slice(0, start));
      out.push(out.length > 0 && depth > 0 ? { text: piece, c: true } : piece);
    }
    start = splitAt;
  }

  return out.length ? out : [s];
}

function collectParagraphs($, $h2) {
  const out = [];
  const $chunk = $h2.nextUntil("h2");
  $chunk.each((_, el) => {
    if (el.type !== "tag") return;
    if (el.name === "p") {
      const $p = $(el);
      if ($p.closest(".caption").length) return;
      const t = paragraphText($, el);
      if (!isTrivial(t)) out.push(t);
      return;
    }
    $(el)
      .find("p")
      .each((__, pEl) => {
        const $p = $(pEl);
        if ($p.closest(".caption").length) return;
        const t = paragraphText($, pEl);
        if (!isTrivial(t)) out.push(t);
      });
  });
  return out;
}

function extractChapterLabel(h2Plain) {
  const t = h2Plain.replace(/\s+/g, " ").trim();
  if (/^VOLUME\s+/i.test(t)) return null;
  const m = t.match(CHAPTER_TAIL);
  return m ? m[1].replace(/\.\s*$/, "").trim() : null;
}

/** Display title: "Chapter II" or "VOLUME II — Chapter III" (Emma). */
function formatChapterTitle(label, volumePrefix) {
  const m = label.match(/^CHAPTER\s*(.+)$/i);
  const rest = m ? m[1].trim() : label;
  const body = `Chapter ${rest}`;
  return volumePrefix ? `${volumePrefix} — ${body}` : body;
}

function parseBook(html, meta) {
  const body = sliceGutenbergBody(html);
  const $ = cheerio.load(body, { decodeEntities: true });
  const chapters = [];
  let volumePrefix = "";

  $("h2").each((_, h2) => {
    const $h2 = $(h2);
    const plain = $h2.text();
    const vol = plain.replace(/\s+/g, " ").trim();
    if (/^VOLUME\s+[IVXLCDM]+/i.test(vol)) {
      volumePrefix = vol.split(/\s+/).slice(0, 2).join(" "); // "VOLUME I"
      return;
    }
    const label = extractChapterLabel(plain);
    if (!label) return;
    const title = formatChapterTitle(label, meta.slug === "emma" ? volumePrefix : "");
    const paragraphs = collectParagraphs($, $h2).flatMap((p) => splitLongParagraph(p));
    if (paragraphs.length === 0) return;
    chapters.push({ title, paragraphs });
  });

  return {
    id: meta.id,
    title: meta.title,
    author: "Jane Austen",
    chapters,
  };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "AustenReader/1.0 (local build; https://www.gutenberg.org/)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

mkdirSync(OUT_DIR, { recursive: true });

for (const meta of BOOKS) {
  process.stderr.write(`Fetching ${meta.slug}…\n`);
  const html = await fetchHtml(meta.url);
  const book = parseBook(html, meta);
  const path = join(OUT_DIR, `${meta.slug}.json`);
  writeFileSync(path, JSON.stringify(book) + "\n", "utf8");
  process.stderr.write(
    `  → ${book.chapters.length} chapters, ${path}\n`,
  );
}

process.stderr.write("Done.\n");
