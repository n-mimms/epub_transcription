# Canonical JSON formats (converter)

Quick reference for agents. See also [`AGENTS.md`](../AGENTS.md) and [`arpp.md`](arpp.md).

## Book — `src/data/books/{bookId}.json`

| Field | Type | Required |
|-------|------|----------|
| `id` | string | slug, e.g. `pride-and-prejudice` |
| `title` | string | display title |
| `author` | string | |
| `chapters` | array | ordered |
| `chapters[].title` | string | chapter heading |
| `chapters[].paragraphs` | array | block texts in order |

**Paragraph cell** — each element is either:

- **string** — full paragraph text, or
- **object** — `{ "text": string, "c"?: boolean }` where `c: true` means the paragraph is a split **tail** still inside the same opening `“` (no leading curly quote in `text`).

## Speakers — `src/data/speakers/{bookId}.json`

| Field | Type | Required |
|-------|------|----------|
| `schemaVersion` | `1` | yes |
| `bookId` | string | must match book file |
| `source` | object | optional audit (`encoder`, `generatedAt`, `bookJsonSha256`) |
| `chapterManualValidation` | object | optional `"chapterIndex"` → `{ validatedAt }` |
| `chunks` | object | sparse map |
| `deliveryChunks` | object | optional; parallel to `chunks` — `whisper`, `shout`, `normal`, … |
| `audioChunks` | object | optional; parallel to `chunks` — EPUB-relative MP3 paths after synth |

**`chunks` key:** `"chapterIndex:paragraphIndex"` (decimal strings, 0-based).

**`chunks` value:** array of `string | null`, length = number of dialogue chunks in that paragraph.

See [`DIALOGUE_AUDIO.md`](DIALOGUE_AUDIO.md) for synth, voice map, and ARPP export.

**Dialogue chunk:** each match of `/([“"][^”"]*[”"])/g` on probed paragraph text (prepend `\u201c` when `c: true`).

## Theatric — `src/data/theatric/{bookId}.json`

Optional. Exported as `OEBPS/metadata/theatric.json` when present. See [`arpp.md`](arpp.md) § metadata/theatric.json and [`src/data/theatric/README.md`](../src/data/theatric/README.md).

| Field | Type | Required |
|-------|------|----------|
| `schemaVersion` | `1` | yes |
| `bookId` | string | must match book file |
| `scenes` | array | yes (may be empty) |
| `scenes[].startBlockId` / `endBlockId` | string | ARPP block ids (`ch02-p014`); span must exist in book |
| `scenes[].doNow` | string[] | optional implementation notes |
| `scenes[].soundscape` | object | optional (`description`, `file`) |
| `scenes[].setting` | object | optional (location/time hints) |
| `scenes[].embeddedTexts` | array | optional letter-like spans |
| `embeddedTexts` | array | optional top-level spans |

`npm run export-arpp` parses and validates spans against `books/{id}.json` before writing the EPUB. Scene **`soundscape.file`** paths are copied from `src/data/audio/` into the package (same as dialogue MP3s).

## Validation

`npm run validate-speakers` — fails if any `chunks` array length ≠ `countDialogueChunks` for that paragraph.

## ARPP export

Does not change authoring keys; export adds block ids (`ch02-p014`) and optional inline `data-ar-speaker` in XHTML. Sidecar inside EPUB may use block-id keys; ereader import maps back to `chapter:paragraph`. Optional **`metadata/theatric.json`** is copied from `src/data/theatric/{bookId}.json` when that file exists.
