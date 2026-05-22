# Austen Reader Publication Profile (ARPP)

ARPP is an [EPUB 3](https://www.w3.org/publishing/epub32/) publication profile used as the **handoff format** between the converter repo (Gutenberg extract, LLM speaker encoding) and the ereader repo. Authoring stays in **book JSON + speakers JSON** (optional **theatric JSON**); EPUB is produced **after** attribution validates.

**Profile version:** `1` (OPF `meta property="arpp:version"`).

## Package layout

```
mimetype
META-INF/container.xml
OEBPS/content.opf
OEBPS/nav.xhtml
OEBPS/ch00.xhtml … chNN.xhtml
OEBPS/metadata/characters.json
OEBPS/metadata/speakers.json          (optional but recommended)
OEBPS/metadata/publication.json       (optional — chapter media)
OEBPS/metadata/theatric.json        (optional — scenes, letters, soundscape hooks)
OEBPS/audio/…  OEBPS/images/…         (optional manifest assets)
```

## Body markup (XHTML)

- One spine item per chapter (`ch00.xhtml`, …).
- Chapter title in `<h1>`.
- Each paragraph: `<p id="ch02-p014">` — **block id** = `ch` + 2-digit chapter index + `-p` + 3-digit paragraph index (0-based).
- Quoted speech with known speaker:

```html
<span data-ar-speaker="mr_bennet">“I hope Mr. Bingley will like it, Lizzy.”</span>
```

- Mid-speech paragraph split (book JSON `{ "text": "…", "c": true }`):

```html
<p id="ch01-p003" data-ar-dialogue-continuation="true">…tail of speech…</p>
```

`data-ar-speaker` values are keys in `metadata/characters.json`, not display names.

## metadata/characters.json

```json
{
  "schemaVersion": 1,
  "bookId": "pride-and-prejudice",
  "characters": [
    {
      "id": "mr_bennet",
      "name": "Mr. Bennet",
      "aliases": ["Mr. Bennet", "Mr Bennet"],
      "colorIndex": 2
    }
  ]
}
```

`colorIndex` maps to ereader CSS `--char-N` when present.

## metadata/speakers.json

Sparse map **block id → speaker name array** (parallel to dialogue chunks in that paragraph). Keys in the encoder repo remain `chapterIndex:paragraphIndex`; export translates to block ids. Omitted paragraphs have no key.

Preserves `source`, `chapterManualValidation` from the encoder sidecar when exported.

## metadata/publication.json (optional)

Chapter-level enrichment (ambient audio, cover image) referencing manifest paths:

```json
{
  "chapters": [
    { "spineIndex": 0, "ambientAudio": "audio/ch00-ambient.mp3", "coverImage": "images/ch00.jpg" }
  ]
}
```

## metadata/theatric.json (optional)

Theatric reading data: **scenes** (contiguous block-id spans with `doNow` notes, optional `soundscape` / `setting`) and **embedded texts** (letters, clippings, …). Authored in the converter repo as `src/data/theatric/{bookId}.json`; `npm run export-arpp` validates spans against book JSON and bundles this file.

```json
{
  "schemaVersion": 1,
  "bookId": "pride-and-prejudice",
  "scenes": [
    {
      "id": "ch34-evening",
      "startBlockId": "ch33-p000",
      "endBlockId": "ch33-p120",
      "doNow": [
        "Soundscape: add ambient file when ready",
        "Map: Longbourn drawing room (later)"
      ],
      "soundscape": {
        "description": "Quiet evening, distant carriage",
        "file": null
      },
      "setting": {
        "locationDescription": "Longbourn",
        "timeOfDay": "evening"
      },
      "embeddedTexts": [
        {
          "id": "darcy-letter",
          "startBlockId": "ch33-p015",
          "endBlockId": "ch33-p090",
          "kind": "letter",
          "senderCharacterId": "fitzwilliam_darcy",
          "recipientCharacterId": "elizabeth_bennet",
          "summary": "Darcy's letter to Elizabeth",
          "presentation": { "openInteraction": "wax_seal" },
          "doNow": ["Ereader: seal swipe + parchment typography"]
        }
      ]
    }
  ],
  "embeddedTexts": []
}
```

- **`doNow`**: implementation checklist strings (not rendered in the book file).
- **Top-level `embeddedTexts`**: optional spans not scoped to a single scene (usually prefer scene-local entries).
- **`kind`**: free string; common values include `letter`, `diary_entry`, `newspaper_excerpt`, `telegram`, `ship_log`, `other`.
- **`soundscape.file`**: when set to a non-null string (`audio/{bookId}/…mp3`), export copies bytes from `src/data/audio/` into the EPUB and registers the path in the package manifest (alongside dialogue MP3s).

## Canonical authoring formats (converter repo)

| File | Role |
|------|------|
| `src/data/books/{id}.json` | `{ id, title, author, chapters: [{ title, paragraphs }] }` |
| `src/data/speakers/{id}.json` | `chunks["chapter:paragraph"] → speakers[]` |
| `src/data/theatric/{id}.json` | Scenes + embedded texts (`theatric.json` in EPUB) — optional |

Do **not** run the LLM encoder on EPUB HTML; keep encoding on plain paragraph strings.

## Scripts

**This repo (converter):**

```bash
npm run export-arpp:all
npm run verify-arpp
```

**Ereader repo (austen):** copies `exports/arpp/*.epub` → `publications/arpp/`, then `npm run dev` runs `build:books-from-arpp` (import only).

Implementation: [`src/lib/arpp/`](../src/lib/arpp/).
