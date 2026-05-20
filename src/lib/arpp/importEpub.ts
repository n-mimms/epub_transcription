import JSZip from "jszip";
import * as cheerio from "cheerio";
import type { Book, Chapter, ParagraphCell } from "@/lib/bookTypes";
import {
  SPEAKER_ATTRIBUTION_SCHEMA_VERSION,
  type SpeakerAttributionFile,
} from "@/lib/speakerAttribution";
import { listDialogueChunkTexts } from "@/lib/dialogueChunks";
import { ARPP_CONTINUATION_ATTR, ARPP_SPEAKER_ATTR, ARPP_VERSION } from "@/lib/arpp/constants";
import { nameFromCharacterId, type ArppCharacterEntry } from "@/lib/arpp/characterIds";
import { chunkMapKeyFromBlockId, parseBlockId } from "@/lib/arpp/blockIds";

function decodeXmlText(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Plain paragraph text from ARPP XHTML (unwrap speaker spans). */
export function paragraphPlainTextFromXhtml(innerHtml: string): string {
  const $ = cheerio.load(`<root>${innerHtml}</root>`, { xml: { xmlMode: false } });
  return decodeXmlText($("root").text());
}

/** Speakers per dialogue chunk from inline `data-ar-speaker` spans. */
export function speakersFromParagraphXhtml(
  innerHtml: string,
  plainText: string,
  dialogueContinuation: boolean,
  roster: ArppCharacterEntry[],
): (string | null)[] {
  const chunks = listDialogueChunkTexts(plainText, dialogueContinuation);
  if (chunks.length === 0) return [];

  const $ = cheerio.load(`<root>${innerHtml}</root>`, { xml: { xmlMode: false } });
  const spanSpeakers: string[] = [];
  $(`[${ARPP_SPEAKER_ATTR}]`).each((_, el) => {
    const id = $(el).attr(ARPP_SPEAKER_ATTR);
    if (id) spanSpeakers.push(id);
  });

  if (spanSpeakers.length === chunks.length) {
    return spanSpeakers.map((id) => nameFromCharacterId(id, roster));
  }

  return chunks.map(() => null);
}

function parseOpfSpine(opfXml: string): { hrefById: Map<string, string>; spineHrefs: string[] } {
  const $ = cheerio.load(opfXml, { xmlMode: true });
  const hrefById = new Map<string, string>();
  $("manifest item").each((_, el) => {
    const id = $(el).attr("id");
    const href = $(el).attr("href");
    if (id && href) hrefById.set(id, href);
  });
  const spineHrefs: string[] = [];
  $("spine itemref").each((_, el) => {
    const idref = $(el).attr("idref");
    if (idref) {
      const href = hrefById.get(idref);
      if (href) spineHrefs.push(href);
    }
  });
  return { hrefById, spineHrefs };
}

async function readZipTextAsync(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path.replace(/\\/g, "/"));
  if (!file) return null;
  return file.async("string");
}

export interface ImportArppResult {
  book: Book;
  speakerAttribution: SpeakerAttributionFile | null;
  characters: ArppCharacterEntry[];
}

export async function importArppEpub(buffer: Buffer): Promise<ImportArppResult> {
  const zip = await JSZip.loadAsync(buffer);

  const containerXml = await readZipTextAsync(zip, "META-INF/container.xml");
  if (!containerXml) throw new Error("Invalid EPUB: missing META-INF/container.xml");

  const $c = cheerio.load(containerXml, { xmlMode: true });
  const opfPath = $c("rootfile").attr("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: no rootfile in container.xml");

  const opfDir = opfPath.includes("/") ? opfPath.replace(/\/[^/]+$/, "/") : "";
  const opfXml = await readZipTextAsync(zip, opfPath);
  if (!opfXml) throw new Error(`Invalid EPUB: missing ${opfPath}`);

  const $opf = cheerio.load(opfXml, { xmlMode: true });
  const title = $opf("dc\\:title, title").first().text().trim() || "Untitled";
  const author = $opf("dc\\:creator, creator").first().text().trim() || "Unknown";
  const identifier =
    $opf("dc\\:identifier, identifier").first().text().trim() || "unknown";
  const bookId =
    identifier.replace(/^urn:uuid:/, "").replace(/-/g, "").slice(0, 32) ||
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const arppVersion = $opf(`meta[property="arpp:version"]`).attr("content");
  if (arppVersion && parseInt(arppVersion, 10) > ARPP_VERSION) {
    console.warn(`ARPP version ${arppVersion} is newer than importer (${ARPP_VERSION})`);
  }

  const charsPath = `${opfDir}metadata/characters.json`.replace(/\/+/g, "/");
  const charsRaw = await readZipTextAsync(zip, charsPath);
  let roster: ArppCharacterEntry[] = [];
  let resolvedBookId = bookId;
  if (charsRaw) {
    const parsed = JSON.parse(charsRaw) as {
      bookId?: string;
      characters?: ArppCharacterEntry[];
    };
    roster = parsed.characters ?? [];
    if (parsed.bookId) resolvedBookId = parsed.bookId;
  }

  const speakersPath = `${opfDir}metadata/speakers.json`.replace(/\/+/g, "/");
  const speakersRaw = await readZipTextAsync(zip, speakersPath);
  let sidecarChunks: Record<string, (string | null)[]> = {};
  let sidecarMeta: Partial<SpeakerAttributionFile> = {};
  if (speakersRaw) {
    const parsed = JSON.parse(speakersRaw) as SpeakerAttributionFile;
    sidecarChunks = parsed.chunks ?? {};
    sidecarMeta = {
      source: parsed.source,
      chapterManualValidation: parsed.chapterManualValidation,
    };
    if (parsed.bookId) resolvedBookId = parsed.bookId;
  }

  const { spineHrefs } = parseOpfSpine(opfXml);
  const chapters: Chapter[] = [];
  const chunks: Record<string, (string | null)[]> = {};

  for (const href of spineHrefs) {
    if (href === "nav.xhtml" || href.endsWith("nav.xhtml")) continue;
    const fullPath = `${opfDir}${href}`.replace(/\/+/g, "/");
    const xhtml = await readZipTextAsync(zip, fullPath);
    if (!xhtml) continue;

    const $ = cheerio.load(xhtml, { xmlMode: false });
    const chapterTitle = $("h1").first().text().trim() || href;
    const paragraphs: ParagraphCell[] = [];

    $("body p[id]").each((_, el) => {
      const id = $(el).attr("id");
      if (!id || !parseBlockId(id)) return;

      const dialogueContinuation = $(el).attr(ARPP_CONTINUATION_ATTR) === "true";
      const innerHtml = $(el).html() ?? "";
      let plainText = paragraphPlainTextFromXhtml(innerHtml);
      if (dialogueContinuation && plainText.startsWith("\u201c")) {
        plainText = plainText.slice(1);
      }
      const cell: ParagraphCell = dialogueContinuation
        ? { text: plainText, c: true }
        : plainText;
      paragraphs.push(cell);

      const inlineSpeakers = speakersFromParagraphXhtml(
        innerHtml,
        plainText,
        dialogueContinuation,
        roster,
      );
      const sidecarRow = sidecarChunks[id];
      const row = inlineSpeakers.some((s) => s != null) ? inlineSpeakers : sidecarRow;
      if (row?.length) {
        const key = chunkMapKeyFromBlockId(id);
        if (key) chunks[key] = row;
      }
    });

    chapters.push({ title: chapterTitle, paragraphs });
  }

  const book: Book = {
    id: resolvedBookId,
    title,
    author,
    chapters,
  };

  const speakerAttribution: SpeakerAttributionFile | null =
    Object.keys(chunks).length > 0 || speakersRaw
      ? {
          schemaVersion: SPEAKER_ATTRIBUTION_SCHEMA_VERSION,
          bookId: resolvedBookId,
          ...sidecarMeta,
          chunks,
        }
      : null;

  return { book, speakerAttribution, characters: roster };
}
