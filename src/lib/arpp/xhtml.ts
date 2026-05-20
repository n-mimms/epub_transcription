import { DIALOGUE_SEGMENT } from "@/lib/dialogueChunks";
import { ARPP_CONTINUATION_ATTR, ARPP_SPEAKER_ATTR } from "@/lib/arpp/constants";

export function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap each dialogue chunk in `<span data-ar-speaker="…">` when a speaker is known.
 * Plain text between chunks is escaped; probe matches {@link DIALOGUE_SEGMENT} (incl. `c: true`).
 */
export function paragraphBodyXhtml(
  text: string,
  speakers: (string | null)[] | undefined,
  nameToId: Map<string, string>,
  dialogueContinuation?: boolean,
): string {
  const probe = dialogueContinuation ? "\u201c" + text : text;
  const shift = dialogueContinuation ? 1 : 0;
  const re = new RegExp(DIALOGUE_SEGMENT.source, DIALOGUE_SEGMENT.flags);
  let lastTextIndex = 0;
  let chunkIndex = 0;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(probe)) !== null) {
    const textStart = Math.max(0, m.index - shift);
    const textEnd = Math.max(textStart, m.index + m[0].length - shift);
    out += escapeXmlText(text.slice(lastTextIndex, textStart));
    const chunk = text.slice(textStart, textEnd);
    const speaker = speakers?.[chunkIndex] ?? null;
    chunkIndex++;
    const escaped = escapeXmlText(chunk);
    const charId = speaker ? nameToId.get(speaker) : undefined;
    if (charId) {
      out += `<span ${ARPP_SPEAKER_ATTR}="${escapeXmlText(charId)}">${escaped}</span>`;
    } else {
      out += escaped;
    }
    lastTextIndex = textEnd;
  }
  out += escapeXmlText(text.slice(lastTextIndex));
  return out;
}

export function chapterXhtml(
  chapterTitle: string,
  blocks: { blockId: string; bodyHtml: string; dialogueContinuation?: boolean }[],
): string {
  const paras = blocks
    .map((b) => {
      const cont = b.dialogueContinuation
        ? ` ${ARPP_CONTINUATION_ATTR}="true"`
        : "";
      return `    <p id="${escapeXmlText(b.blockId)}"${cont}>${b.bodyHtml}</p>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXmlText(chapterTitle)}</title>
</head>
<body>
  <h1>${escapeXmlText(chapterTitle)}</h1>
${paras}
</body>
</html>
`;
}

export function navXhtml(bookTitle: string, chapters: { href: string; title: string }[]): string {
  const items = chapters
    .map(
      (c) =>
        `        <li><a href="${escapeXmlText(c.href)}">${escapeXmlText(c.title)}</a></li>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXmlText(bookTitle)} — Contents</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`;
}
