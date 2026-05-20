import crypto from "crypto";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import type { Book, Chapter, ParagraphCell } from "@/lib/bookTypes";
import type { SpeakerAttributionFile } from "@/lib/speakerAttribution";
import { getCharactersForBook } from "@/lib/characters";
import {
  chunkMapKeyToBlockId,
  epubHrefToDiskPath,
  loadDialogueVoiceMap,
  characterVoicesForExport,
  voiceMapAudioMeta,
} from "@/lib/dialogueAudio";
import { ARPP_META_PROPERTY, ARPP_PROFILE_URI, ARPP_VERSION } from "@/lib/arpp/constants";
import { buildCharacterIdMap } from "@/lib/arpp/characterIds";
import { blockId, chunkMapKey } from "@/lib/arpp/blockIds";
import { chapterXhtml, navXhtml, paragraphBodyXhtml } from "@/lib/arpp/xhtml";

function cellParts(cell: ParagraphCell): { text: string; dialogueContinuation: boolean } {
  if (typeof cell === "string") return { text: cell, dialogueContinuation: false };
  return { text: cell.text, dialogueContinuation: !!cell.c };
}

function publicationUuid(bookId: string): string {
  const hash = crypto.createHash("sha256").update(`arpp:${bookId}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

function buildOpf(
  book: Book,
  spineIds: string[],
  manifestExtras: { id: string; href: string; mediaType: string; properties?: string }[],
): string {
  const uuid = publicationUuid(book.id);
  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    ...spineIds.map(
      (id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`,
    ),
    ...manifestExtras.map((m) => {
      const props = m.properties ? ` properties="${m.properties}"` : "";
      return `<item id="${m.id}" href="${m.href}" media-type="${m.mediaType}"${props}/>`;
    }),
  ].join("\n    ");

  const spineRefs = spineIds.map((id) => `<itemref idref="${id}"/>`).join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.w3.org/ns/opf" version="3.0" unique-identifier="pub-id" prefix="arpp: ${ARPP_PROFILE_URI}/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeOpf(book.title)}</dc:title>
    <dc:creator>${escapeOpf(book.author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
    <meta property="${ARPP_META_PROPERTY}">${ARPP_VERSION}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineRefs}
  </spine>
</package>
`;
}

function escapeOpf(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ExportArppOptions {
  /** Include `metadata/speakers.json` (blockId keys) for round-trip / debugging. */
  includeSpeakersSidecar?: boolean;
  /** Optional `metadata/publication.json` (chapter media descriptors). */
  publicationJson?: Record<string, unknown>;
  /** Root of `src/data` (for copying `audio/{bookId}/*.mp3`). */
  dataRoot?: string;
  /** Root of `src/data/voices` (voice map JSON per book). */
  voicesDir?: string;
}

export async function exportBookToArppEpub(
  book: Book,
  speakers: SpeakerAttributionFile | null,
  options: ExportArppOptions = {},
): Promise<Buffer> {
  const { nameToId, roster } = buildCharacterIdMap(getCharactersForBook(book.id));
  const includeSpeakers = options.includeSpeakersSidecar !== false;

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file("META-INF/container.xml", container);

  const oebps = zip.folder("OEBPS")!;
  const metaFolder = oebps.folder("metadata")!;

  let voiceMap = null;
  const voicesDir = options.voicesDir ?? path.join(options.dataRoot ?? "", "voices");
  if (options.dataRoot) {
    try {
      voiceMap = loadDialogueVoiceMap(voicesDir, book.id);
    } catch {
      /* voice map optional at export */
    }
  }

  const charactersJson = {
    schemaVersion: ARPP_VERSION,
    bookId: book.id,
    ...(voiceMap ? { audio: voiceMapAudioMeta(voiceMap) } : {}),
    ...(speakers?.source?.audioProvider ? { audioSynthProvider: speakers.source.audioProvider } : {}),
    characters: roster.map((c) => ({
      ...c,
      ...(voiceMap ? { voices: characterVoicesForExport(voiceMap, c.name) } : {}),
    })),
  };
  metaFolder.file("characters.json", JSON.stringify(charactersJson, null, 2));

  const speakerChunks: Record<string, (string | null)[]> = {};
  const deliveryByBlock: Record<string, string[]> = {};
  const spineIds: string[] = [];
  const navChapters: { href: string; title: string }[] = [];

  book.chapters.forEach((chapter: Chapter, chapterIndex: number) => {
    const spineId = `ch${String(chapterIndex).padStart(2, "0")}`;
    spineIds.push(spineId);
    navChapters.push({ href: `${spineId}.xhtml`, title: chapter.title });

    const blocks = chapter.paragraphs.map((cell, paragraphIndex) => {
      const { text, dialogueContinuation } = cellParts(cell);
      const key = chunkMapKey(chapterIndex, paragraphIndex);
      const row = speakers?.chunks[key];
      const deliveries = speakers?.deliveryChunks?.[key];
      const bid = blockId(chapterIndex, paragraphIndex);
      if (row?.length) speakerChunks[bid] = row;
      if (deliveries?.length) deliveryByBlock[bid] = deliveries;

      return {
        blockId: bid,
        bodyHtml: paragraphBodyXhtml(text, row, nameToId, dialogueContinuation),
        dialogueContinuation,
      };
    });

    oebps.file(`${spineId}.xhtml`, chapterXhtml(chapter.title, blocks));
  });

  if (includeSpeakers && speakers) {
    const speakersJson = {
      schemaVersion: speakers.schemaVersion,
      bookId: speakers.bookId,
      source: speakers.source,
      chapterManualValidation: speakers.chapterManualValidation,
      chunks: speakerChunks,
      ...(Object.keys(deliveryByBlock).length > 0 ? { deliveryChunks: deliveryByBlock } : {}),
    };
    metaFolder.file("speakers.json", JSON.stringify(speakersJson, null, 2));
  }

  if (options.publicationJson) {
    metaFolder.file("publication.json", JSON.stringify(options.publicationJson, null, 2));
  }

  const dialogueAudioByBlock: Record<string, string[]> = {};
  if (speakers?.audioChunks && Object.keys(speakers.audioChunks).length > 0) {
    if (!options.dataRoot) {
      throw new Error("exportBookToArppEpub: dataRoot is required when speakers.audioChunks is set");
    }
    for (const [key, hrefs] of Object.entries(speakers.audioChunks)) {
      const bid = chunkMapKeyToBlockId(key);
      if (!bid) continue;
      const exported: string[] = [];
      for (const href of hrefs) {
        const diskPath = epubHrefToDiskPath(options.dataRoot, href);
        if (!fs.existsSync(diskPath)) {
          throw new Error(`Missing dialogue audio file: ${diskPath} (key ${key})`);
        }
        const bytes = fs.readFileSync(diskPath);
        oebps.file(href, bytes);
        exported.push(href);
      }
      if (exported.length) dialogueAudioByBlock[bid] = exported;
    }
    if (Object.keys(dialogueAudioByBlock).length > 0) {
      const dialogueAudioJson = {
        schemaVersion: 1,
        bookId: book.id,
        chunks: dialogueAudioByBlock,
      };
      metaFolder.file("dialogue-audio.json", JSON.stringify(dialogueAudioJson, null, 2));
    }
  }

  oebps.file("nav.xhtml", navXhtml(book.title, navChapters));

  const manifestExtras: { id: string; href: string; mediaType: string; properties?: string }[] = [
    { id: "characters", href: "metadata/characters.json", mediaType: "application/json" },
  ];
  if (includeSpeakers && speakers) {
    manifestExtras.push({
      id: "speakers",
      href: "metadata/speakers.json",
      mediaType: "application/json",
    });
  }
  if (options.publicationJson) {
    manifestExtras.push({
      id: "publication",
      href: "metadata/publication.json",
      mediaType: "application/json",
    });
  }
  if (Object.keys(dialogueAudioByBlock).length > 0) {
    manifestExtras.push({
      id: "dialogue-audio",
      href: "metadata/dialogue-audio.json",
      mediaType: "application/json",
    });
    for (const href of new Set(Object.values(dialogueAudioByBlock).flat())) {
      const manifestId = href.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      manifestExtras.push({
        id: manifestId,
        href,
        mediaType: "audio/mpeg",
      });
    }
  }

  oebps.file("content.opf", buildOpf(book, spineIds, manifestExtras));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}
