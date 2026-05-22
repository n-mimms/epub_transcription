# Agent notes — epub_transcription (converter)

This repo **produces** ARPP EPUBs and maintains canonical **book + speaker JSON** (optional **theatric JSON** for scenes / letters). It does **not** ship a React UI. The sibling ereader ([`../austen`](../austen)) consumes `exports/arpp/*.epub` at build time.

Human overview: [`README.md`](README.md). JSON schemas: [`docs/formats.md`](docs/formats.md). ARPP wire format: [`docs/arpp.md`](docs/arpp.md). Encoder: [`docs/encode-speakers.md`](docs/encode-speakers.md). **Dialogue audio (synth + EPUB):** [`docs/DIALOGUE_AUDIO.md`](docs/DIALOGUE_AUDIO.md). **Ereader playback plan:** [`../austen/docs/PLAN_THEATRIC_SPEAK_ALOUD.md`](../austen/docs/PLAN_THEATRIC_SPEAK_ALOUD.md). Historical plan: [`docs/POLLY_THEATRIC_AUDIO_PLAN.md`](docs/POLLY_THEATRIC_AUDIO_PLAN.md).

## Pipeline (do not skip steps)

```text
Gutenberg HTML
  → npm run extract-books          → src/data/books/{id}.json
  → npm run encode-speakers        → src/data/speakers/{id}.json  (+ deliveryChunks)
  → validate + chapterManualValidation (human)
  → npm run synth-dialogue-audio   → src/data/audio/{id}/*.mp3
  → npm run validate-dialogue-audio
  → npm run export-arpp:all        → exports/arpp/{id}.epub (bundles audio; optional `src/data/theatric/{id}.json`)
  → npm run verify-arpp
  → copy *.epub to ereader publications/arpp/
```

**Do not** run the LLM encoder on EPUB XHTML. Encoding always uses **plain paragraph strings** from book JSON.

## Canonical data formats

### Book JSON — `src/data/books/{bookId}.json`

```json
{
  "id": "pride-and-prejudice",
  "title": "Pride and Prejudice",
  "author": "Jane Austen",
  "chapters": [
    {
      "title": "Chapter I",
      "paragraphs": [
        "Narration paragraph.",
        "“Dialogue,” said someone.",
        { "text": "continued speech without opening quote.", "c": true }
      ]
    }
  ]
}
```

| Field | Rules |
|-------|--------|
| `paragraphs[]` | Usually a **string**. `{ "text", "c": true }` = tail still inside same `“…` (extract script); reader prepends synthetic `\u201c` for dialogue regex. |
| Chapter / paragraph indexes | **0-based** everywhere in tooling. |

Type definitions: [`src/lib/bookTypes.ts`](src/lib/bookTypes.ts).

### Speaker sidecar — `src/data/speakers/{bookId}.json`

```json
{
  "schemaVersion": 1,
  "bookId": "pride-and-prejudice",
  "source": {
    "encoder": "google-gemini-3.1-flash-lite",
    "generatedAt": "2026-05-15T18:49:29.148Z",
    "bookJsonSha256": "f01ec2d3…"
  },
  "chapterManualValidation": { "1": { "validatedAt": "2026-05-10T12:00:00.000Z" } },
  "chunks": { "0:2": ["Mrs. Bennet", "Mrs. Bennet"] },
  "deliveryChunks": { "0:2": ["normal", "shout"] },
  "audioChunks": { "0:2": ["audio/pride-and-prejudice/ch00-p002-0.mp3", "…"] },
  "chapterManualValidation": { "0": { "validatedAt": "…" } }
}
```

| Field | Rules |
|-------|--------|
| `chunks` key | `"chapterIndex:paragraphIndex"` (0-based). **Sparse** — omit keys for narration-only paragraphs. |
| `chunks` value | Array **parallel to dialogue chunks** in that paragraph (same order as [`listDialogueChunkTexts`](src/lib/dialogueChunks.ts)). |
| `deliveryChunks` | Optional parallel map; delivery enum (`whisper`, `shout`, …) — see [`docs/DIALOGUE_AUDIO.md`](docs/DIALOGUE_AUDIO.md). |
| `audioChunks` | Optional parallel map; EPUB-relative paths after synth. |
| Array entries | Canonical [`CharacterDef.name`](src/lib/characters.ts) or `null`. |
| `chapterManualValidation` | Encoder skips those chapters unless `--force-validated`. Run **synth only after** validation. |

**Indexing pitfall:** `"1:1"` = 2nd chapter, 2nd paragraph — not “Chapter I”.

Dialogue detection: [`src/lib/dialogueChunks.ts`](src/lib/dialogueChunks.ts) — `/([“"][^”"]*[”"])/g` on probed text.

### Character roster — `src/lib/characters.ts`

Per-`bookId` canonical names, aliases, `colorVar` (`--char-1` … `--char-20`). Encoder and export use this; ereader apps keep their own copy for UI colors.

## ARPP export

- Implementation: [`src/lib/arpp/`](src/lib/arpp/) (`exportEpub.ts`, `xhtml.ts`, `blockIds.ts`, `characterIds.ts`).
- Block ids: `ch02-p014` (chapter 2, paragraph 14).
- Inline: `<span data-ar-speaker="mr_bennet">` (slug id from [`buildCharacterIdMap`](src/lib/arpp/characterIds.ts)).
- Package metadata: `characters.json` (includes `voices` when voice map exists), `speakers.json`, `dialogue-audio.json` (when MP3s exported).
- Audio binaries: `OEBPS/audio/{bookId}/ch00-p002-0.mp3`.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run extract-books` | Gutenberg → `src/data/books/*.json` |
| `npm run build-speakers` | Refresh sidecar shells (preserve `chunks`, `audioChunks`, …) |
| `npm run validate-speakers` | `chunks[*].length` vs dialogue chunk count |
| `npm run encode-speakers` | Gemini + heuristics (`GOOGLE_API_KEY`); fills `deliveryChunks` |
| `npm run synth-dialogue-audio` | MP3s → `src/data/audio/` (ElevenLabs default; `.env`) |
| `npm run validate-dialogue-audio` | Audio files + array lengths |
| `npm run export-arpp:all` | All books → `exports/arpp/` |
| `npm run export-arpp -- --book=id` | Single export (Windows: `EXPORT_BOOK` or `--book=` without extra `--`) |
| `npm run verify-arpp` | Import EPUBs, diff text + speaker keys vs books |
| `npm test` | Vitest (dialogue, encoder, ARPP round-trip) |

Windows argv: launchers use `npm_config_*` + env fallbacks. See [`docs/DIALOGUE_AUDIO.md`](docs/DIALOGUE_AUDIO.md). Env: `scripts/load-env.mjs` loads repo-root `.env`.

## Encoder merge rule

[`scripts/encode-speakers.ts`](scripts/encode-speakers.ts): **non-null heuristic speakers override** Gemini for that chunk index ([`speakerHeuristics.ts`](src/lib/speakerHeuristics.ts)).

## Gutenberg extract

[`scripts/extract-gutenberg-books.mjs`](scripts/extract-gutenberg-books.mjs) — index [#31100](https://www.gutenberg.org/files/31100/31100-h/31100-h.htm); *Sense and Sensibility* from **#21839**. Caps paragraph length ~1000 chars (`MAX_PARAGRAPH_CHARS`).

## Files for common tasks

| Task | Start here |
|------|------------|
| New novel in corpus | `extract-books`, [`characters.ts`](src/lib/characters.ts), `bookLoader` N/A here |
| Fix wrong speaker | Edit `speakers/{id}.json` `chunks`, or re-`encode-speakers` |
| Theatric scenes / letters | [`src/data/theatric/README.md`](src/data/theatric/README.md), [`docs/arpp.md`](docs/arpp.md) § theatric |
| Prompt / Gemini | [`speakerEncodeGemini.ts`](src/lib/speakerEncodeGemini.ts), [`docs/encode-speakers.md`](docs/encode-speakers.md) |
| Benchmark P&P Ch. II | [`speakerBenchmarkGroundTruth.ts`](src/lib/speakerBenchmarkGroundTruth.ts), `npm run benchmark-speaker-prompts` |

## Handoff to ereader repo

After `export-arpp:all`, copy `exports/arpp/*.epub` → `../austen/publications/arpp/`. Ereader runs `build:books-from-arpp` (import only). Do not copy `src/data/books` into the ereader for production builds.
