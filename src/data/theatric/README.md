# Theatric profile (`theatric.json`)

Optional per-book metadata for **scenes** (soundscape / map hooks) and **embedded documents** (letters, diary extracts, etc.). Authored here as `src/data/theatric/{bookId}.json`; `npm run export-arpp` validates it against the book and embeds **`OEBPS/metadata/theatric.json`** in the ARPP EPUB.

## Conventions

- **Block ids** match ARPP XHTML paragraph ids: `ch00-p000` (0-based chapter and paragraph).
- **`doNow`**: string array of implementation notes (replaces informal `// DO NOW` JSON comments). Safe for humans; ereaders may ignore.
- **`soundscape.file`**: EPUB-relative path when an ambient asset exists (optional; may be `null` while authoring). **`npm run export-arpp`** copies the file from `src/data/audio/…` into the EPUB (requires `dataRoot`, same rules as dialogue MP3s).
- **`senderCharacterId` / `recipientCharacterId`**: slugs aligned with `metadata/characters.json` (`buildCharacterIdMap` ids). Omit or use `null` for unknown.

See [`docs/arpp.md`](../docs/arpp.md) for the full schema.

`npm run export-arpp` copies each referenced **`soundscape.file`** from `src/data/audio/…` into the EPUB (same layout as dialogue MP3s) and lists it in `content.opf`.

## Minimal example

```json
{
  "schemaVersion": 1,
  "bookId": "pride-and-prejudice",
  "scenes": [
    {
      "id": "ch34-letter",
      "startBlockId": "ch33-p010",
      "endBlockId": "ch33-p040",
      "doNow": [
        "Soundscape: export ambient MP3 and set soundscape.file",
        "Map: Longbourn when map feature ships"
      ],
      "soundscape": {
        "description": "Evening house, low fire",
        "file": null
      },
      "embeddedTexts": [
        {
          "id": "darcy-letter",
          "startBlockId": "ch33-p012",
          "endBlockId": "ch33-p038",
          "kind": "letter",
          "summary": "Darcy's explanatory letter to Elizabeth",
          "presentation": { "openInteraction": "wax_seal" },
          "doNow": ["Ereader: swipe seal then reveal parchment layout"]
        }
      ]
    }
  ]
}
```

Block ranges must exist in `src/data/books/{bookId}.json`. Export fails fast if `bookId` or spans are wrong.
