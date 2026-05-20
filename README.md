# epub_transcription

Converter pipeline for themed reader apps (Austen, Shakespeare, …): **Gutenberg → book JSON → speaker attribution → dialogue MP3s → ARPP EPUB**.

The [austen](../austen) ereader imports EPUBs at build time; it does not run this tooling in the browser.

## Recommended workflow

Work **one chapter at a time**. Do not generate MP3s until speakers (and delivery hints) for that chapter are manually validated.

```text
1. Extract / refresh book text
2. Encode speakers (+ delivery) for chapter N
3. Validate & manually review chapter N
4. Mark chapter N validated in speakers sidecar
5. Synth dialogue MP3s for chapter N only
6. Repeat 2–5 for each chapter
7. Export ARPP EPUB (bundles audio) → copy to ereader
```

### Step-by-step commands

```bash
npm install
```

**1. Book text** (once per title, or when refreshing from Gutenberg):

```bash
npm run extract-books
```

**2. Speaker attribution** (per chapter; requires `GOOGLE_API_KEY` in `.env`):

```bash
npm run encode-speakers -- --book=pride-and-prejudice --chapter=0
npm run validate-speakers
```

Review `src/data/speakers/pride-and-prejudice.json` — fix `chunks` (who spoke) and `deliveryChunks` (whisper, shout, normal, …) by hand if needed.

**3. Manual validation** — when a chapter is correct, record it so re-encoding will not overwrite your work:

```json
"chapterManualValidation": {
  "0": { "validatedAt": "2026-05-18T12:00:00.000Z" }
}
```

(Keys are **0-based chapter indexes**, same as `--chapter=0`.)

**4. Dialogue MP3s** (only after validation; per chapter):

Configure voices in `src/data/voices/{bookId}.json` and API keys in `.env` (`ELEVEN_LABS` for default ElevenLabs, or `AWS_*` for Polly).

```bash
npm run synth-dialogue-audio -- --book=pride-and-prejudice --chapters=0
npm run validate-dialogue-audio
```

Preview without API calls: add `--dry-run`. Re-synth existing files: add `--force`. Use Polly instead of ElevenLabs: `--provider=polly`.

**5. Export** (after all chapters you care about have audio):

```bash
npm run export-arpp --book=pride-and-prejudice
npm run verify-arpp
```

Look for `export-arpp: SUCCESS` and `embedded: N MP3 file(s)` in the log.

Copy `exports/arpp/*.epub` → `../austen/publications/arpp/`, then in the ereader repo: `npm run dev`.

## Where do MP3s live? Are they in the EPUB?

**Yes — `npm run synth-dialogue-audio` writes MP3 files locally:**

```text
src/data/audio/{bookId}/ch00-p002-0.mp3
```

The speakers sidecar is updated with parallel `audioChunks` paths (e.g. `audio/pride-and-prejudice/ch00-p002-0.mp3`).

**Yes — `npm run export-arpp` bundles those files into the EPUB** when `audioChunks` is set and the MP3s exist on disk. The package includes:

- `OEBPS/audio/{bookId}/…` — the MP3 assets
- `OEBPS/metadata/dialogue-audio.json` — chunk index → audio paths
- `OEBPS/metadata/characters.json` — cast plus per-character voice map (`voices` / `audio` metadata)

Export **fails** if the sidecar references audio files that are missing locally — run synth for those chapters first.

## Quick start (export only)

If books, speakers, and audio already exist:

```bash
npm install
npm run export-arpp:all
npm run verify-arpp
```

## Repository layout

| Path | Purpose |
|------|---------|
| [`src/data/books/`](src/data/books/) | Canonical text JSON per title |
| [`src/data/speakers/`](src/data/speakers/) | Speaker + delivery + audio path sidecars |
| [`src/data/voices/`](src/data/voices/) | ElevenLabs / Polly voice map per book |
| [`src/data/audio/`](src/data/audio/) | Generated dialogue MP3s (gitignored in practice) |
| [`src/lib/arpp/`](src/lib/arpp/) | ARPP export / import library |
| [`src/lib/characters.ts`](src/lib/characters.ts) | Per-book cast + aliases for encoder |
| [`exports/arpp/`](exports/arpp/) | Published `.epub` files for reader apps |
| [`docs/arpp.md`](docs/arpp.md) | ARPP wire format (EPUB package spec) |
| [`docs/formats.md`](docs/formats.md) | Book + speaker JSON schema reference |
| [`docs/encode-speakers.md`](docs/encode-speakers.md) | Gemini encoder setup |
| [`docs/DIALOGUE_AUDIO.md`](docs/DIALOGUE_AUDIO.md) | **Agent reference:** synth, voice map, ARPP audio assets |
| [`docs/POLLY_THEATRIC_AUDIO_PLAN.md`](docs/POLLY_THEATRIC_AUDIO_PLAN.md) | Original cross-repo plan (historical) |
| [`../austen/docs/PLAN_THEATRIC_SPEAK_ALOUD.md`](../austen/docs/PLAN_THEATRIC_SPEAK_ALOUD.md) | Ereader “Speak aloud” implementation plan |
| [`AGENTS.md`](AGENTS.md) | Architecture notes for AI agents / maintainers |

## Data formats (summary)

**Book** (`src/data/books/{id}.json`):

```json
{ "id", "title", "author", "chapters": [{ "title", "paragraphs": ["…" | { "text", "c": true }] }] }
```

**Speakers** (`src/data/speakers/{id}.json`):

```json
{
  "schemaVersion": 1,
  "bookId": "pride-and-prejudice",
  "chunks": { "0:1": ["Mr. Bennet", null] },
  "deliveryChunks": { "0:1": ["normal", "whisper"] },
  "audioChunks": { "0:1": ["audio/pride-and-prejudice/ch00-p001-0.mp3"] },
  "chapterManualValidation": { "0": { "validatedAt": "…" } }
}
```

Keys are `chapterIndex:paragraphIndex` (0-based). Details in [`docs/formats.md`](docs/formats.md) and [`AGENTS.md`](AGENTS.md).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run extract-books` | Refresh books from Project Gutenberg |
| `npm run build-speakers` | Refresh sidecar metadata (keeps `chunks`, `audioChunks`, …) |
| `npm run validate-speakers` | Verify speaker/delivery array lengths |
| `npm run encode-speakers` | Fill sidecars via Gemini + heuristics |
| `npm run synth-dialogue-audio` | Generate dialogue MP3s (ElevenLabs default, or `--provider=polly`) |
| `npm run validate-dialogue-audio` | Verify audio files + array lengths |
| `npm run benchmark-speaker-prompts` | Score prompts vs P&P Ch. II ground truth |
| `npm run export-arpp:all` | Export all titles to `exports/arpp/` |
| `npm run export-arpp -- --book=id` | Export one title |
| `npm run verify-arpp` | Round-trip EPUB vs book JSON |
| `npm test` | Unit tests |

On Windows, npm often drops flags after `--`. Use either form **without** relying on `--`:

```powershell
npm run synth-dialogue-audio --book=pride-and-prejudice --chapters=0
```

Or set env vars:

```powershell
$env:SYNTH_BOOK = "pride-and-prejudice"
$env:SYNTH_CHAPTERS = "0"
npm run synth-dialogue-audio
```

Same pattern for encode/export: `$env:ENCODE_BOOK = "emma"; npm run encode-speakers`

## Prerequisites

- Node.js (LTS)
- Repo-root `.env` (gitignored), e.g.:
  - `GOOGLE_API_KEY` — speaker encoding ([Google AI Studio](https://aistudio.google.com/apikey))
  - `ELEVEN_LABS` — dialogue MP3s (default TTS provider)
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — optional, for `--provider=polly`

## Related repos

| Repo | Role |
|------|------|
| **epub_transcription** (this) | Authoring, encoding, audio synth, EPUB export |
| **[austen](../austen)** | React ereader; consumes `publications/arpp/*.epub` |

## License / attribution

Source texts: [Project Gutenberg](https://www.gutenberg.org/) (public domain).
