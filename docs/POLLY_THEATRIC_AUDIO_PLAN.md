# Plan: Prerecorded AWS Polly audio for theatric dialogue reveal

**Status:** **Converter implemented** (2026) — see [`DIALOGUE_AUDIO.md`](DIALOGUE_AUDIO.md) and [`README.md`](../README.md). **Ereader playback** not implemented — see [`../austen/docs/PLAN_THEATRIC_SPEAK_ALOUD.md`](../austen/docs/PLAN_THEATRIC_SPEAK_ALOUD.md).  
**Pilot scope:** Pride and Prejudice, **chapters 1–2** (0-based: `chapterIndex` `0` and `1`).  
**Consumer:** [austen](../austen) ereader — play audio when user taps to reveal the next dialogue chunk in **theatric** mode.

---

## Decision (read first)

Use **prerecorded MP3s** bundled in ARPP EPUBs, **not** live Polly on each tap.

| Prerecorded | Live API on reveal |
|-------------|-------------------|
| Instant playback (required for theatric UX) | Noticeable latency |
| Offline / App Store friendly | Needs network + backend proxy |
| One-time synth cost per chunk | Per-tap cost; no AWS keys in client |
| Fits existing `export-arpp` → `publications/arpp` pipeline | New runtime service |

Live Polly may be used **only in converter scripts** while tuning voices; production assets are frozen MP3 files.

---

## End-to-end flow (target state)

```text
epub_transcription                          austen
──────────────────                          ──────
books/{id}.json
speakers/{id}.json
       │
       ▼
npm run synth-dialogue-audio   (NEW)
  → listDialogueChunkTexts per paragraph
  → Polly SynthesizeSpeech per chunk
  → src/data/audio/{id}/ch00-p003-0.mp3
  → src/data/speakers/{id}.json  (+ audio paths per chunk)
       │
       ▼
npm run export-arpp:all
  → EPUB manifest includes OEBPS/audio/…
  → metadata/dialogue-audio.json (NEW, or extend speakers.json)
       │
       ▼
exports/arpp/{id}.epub  ──copy──►  publications/arpp/{id}.epub
                                         │
                                         ▼
                                   predev: import-arpp
                                         │
                                         ▼
                                   imported JSON + audio paths
                                         │
                                         ▼
                                   Reader: theatric tap → Audio.play()
```

---

## Unit of work: dialogue chunk

Audio must align with the **same chunk index** as speaker attribution and theatric reveal.

- Detection: [`src/lib/dialogueChunks.ts`](../src/lib/dialogueChunks.ts) — `listDialogueChunkTexts(text, dialogueContinuation?)`.
- Sidecar key today: `"chapterIndex:paragraphIndex"` → `speakers[]` (one name per chunk).
- **Proposed audio key:** same paragraph key → `audio[]` (one manifest path per chunk, same order).

Example sidecar extension (`src/data/speakers/pride-and-prejudice.json`):

```json
{
  "schemaVersion": 1,
  "bookId": "pride-and-prejudice",
  "chunks": {
    "0:2": {
      "speakers": ["Mrs. Bennet", "Mrs. Bennet"],
      "audio": [
        "audio/pride-and-prejudice/ch00-p002-0.mp3",
        "audio/pride-and-prejudice/ch00-p002-1.mp3"
      ]
    }
  }
}
```

**Alternative (less breaking):** keep `chunks` as `string[]` for speakers only; add parallel `audioChunks` map with identical keys. Prefer **one object per key** only if willing to migrate existing sidecars; otherwise use **`audioChunks`** parallel map for v1.

**File naming convention (stable in EPUB):**

```text
audio/{bookId}/ch{CC}-p{PPP}-{K}.mp3
```

- `CC` = 2-digit chapter index  
- `PPP` = 3-digit paragraph index  
- `K` = 0-based dialogue chunk index within that paragraph  

Matches ARPP block ids: `ch00-p002` + chunk index.

---

## ARPP package extension (v1 or profile bump)

Document in [`arpp.md`](arpp.md) when implementing.

### New manifest assets

```text
OEBPS/audio/{bookId}/ch00-p002-0.mp3
...
```

All listed in `content.opf` `<manifest>` with `media-type="audio/mpeg"`.

### New metadata file (recommended)

`OEBPS/metadata/dialogue-audio.json`:

```json
{
  "schemaVersion": 1,
  "bookId": "pride-and-prejudice",
  "chunks": {
    "ch00-p002": [
      "audio/pride-and-prejudice/ch00-p002-0.mp3",
      "audio/pride-and-prejudice/ch00-p002-1.mp3"
    ]
  }
}
```

Keys are **block ids** (export time). Importer maps back to `"chapterIndex:paragraphIndex"` for the ereader.

**Optional per chunk:** `voiceId`, `characterId`, `durationMs` for QA.

### Character → Polly voice

Extend `metadata/characters.json` (or new `metadata/voices.json`):

```json
{
  "characters": [
    {
      "id": "mr_bennet",
      "name": "Mr. Bennet",
      "pollyVoiceId": "Matthew",
      "pollyEngine": "neural"
    }
  ]
}
```

Ereader does not call Polly; this documents what was used at synth time.

---

## Converter repo work (`epub_transcription`)

### 1. Dependencies

- `@aws-sdk/client-polly` (or AWS CLI wrapper — prefer SDK in Node script).
- Credentials: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (never commit; `.env` gitignored).

### 2. New script: `scripts/synth-dialogue-audio.ts`

**CLI:**

```bash
npm run synth-dialogue-audio -- --book=pride-and-prejudice --chapters=0,1
npm run synth-dialogue-audio -- --book=pride-and-prejudice --dry-run
```

**Behavior:**

1. Load `src/data/books/{book}.json` + `speakers/{book}.json`.
2. For each paragraph in chapter range:
   - `chunks = listDialogueChunkTexts(text, c)`.
   - For each chunk index `k`:
     - Resolve speaker → `pollyVoiceId` from character map (fallback default narrator voice).
     - **SSML or plain text:** strip curly quotes for speech; optional SSML `<prosody>` per character later.
     - Call `SynthesizeSpeech` → write `src/data/audio/{bookId}/ch{cc}-p{ppp}-{k}.mp3`.
     - Skip if file exists unless `--force`.
3. Update sidecar `audioChunks` (or extended `chunks`) parallel to speakers.
4. Write manifest summary JSON for validation.

**Pilot filter:** `--chapters=0,1` only processes those chapter indexes.

### 3. Validation script

`npm run validate-dialogue-audio`:

- For every key in `audioChunks`, array length === `countDialogueChunks` for that paragraph.
- Every path exists on disk.
- Optional: total duration / file size report.

### 4. Export changes — `src/lib/arpp/exportEpub.ts`

- Copy `src/data/audio/{bookId}/**` into EPUB `OEBPS/audio/…`.
- Emit `metadata/dialogue-audio.json`.
- Register all audio files in OPF manifest.

### 5. Import / verify (this repo)

- Extend `importEpub.ts` to read `dialogue-audio.json` and validate round-trip.
- `verify-arpp` optional: compare audio map keys to speaker keys.

### 6. Voice map — `src/data/voices/pride-and-prejudice.json` (or column in characters)

Start with a hand-tuned map for pilot cast (Bennet family). Example:

| Character | Polly voice (example) |
|-----------|------------------------|
| Mr. Bennet | Matthew (neural) |
| Mrs. Bennet | Joanna (neural) |
| Elizabeth / Lizzy | Ruth (neural) |
| … | … |

Use **one voice per `CharacterDef.name`**; do not synth narration paragraphs (chunks only exist where quotes exist).

### 7. `package.json` scripts

```json
"synth-dialogue-audio": "tsx scripts/synth-dialogue-audio.ts",
"validate-dialogue-audio": "node scripts/validate-dialogue-audio.mjs",
"pilot:pp-ch1-2": "npm run synth-dialogue-audio -- --book=pride-and-prejudice --chapters=0,1 && npm run export-arpp -- --book=pride-and-prejudice"
```

---

## Ereader repo work (`austen`) — separate session

Document here so the converter agent knows the contract; implement in **austen** after EPUB export works.

### 1. Import

- [`src/lib/arpp/importEpub.ts`](../../austen/src/lib/arpp/importEpub.ts): parse `metadata/dialogue-audio.json` → attach to imported speaker sidecar or new `dialogueAudio` field on `Book`.
- Copy audio bytes into `src/data/imported/audio/…` **or** keep paths that resolve to `publications/arpp` extracted assets (prefer **bundled files under `imported/audio/`** for Vite `?url` imports).

### 2. Types

Extend imported speaker structure:

```ts
chunks: Record<string, (string | null)[]>;
audioChunks?: Record<string, string[]>; // parallel paths, chunk-aligned
```

### 3. Reader / theatric

In [`Reader.tsx`](../../austen/src/components/Reader.tsx) (or small hook `useTheatricAudio`):

- When `theatricStep` increments (same moment dialogue becomes visible), resolve **global chunk index** for current page → `audioUrl`.
- `new Audio(url).play()`; stop previous clip if still playing.
- Settings: `spokenDialogueEnabled`, `spokenDialogueVolume` in [`settings.ts`](../../austen/src/lib/settings.ts).
- No audio → behave as today (silent reveal).

**Do not** call AWS from the browser.

### 4. Build

- Ensure `build-books-from-arpp` copies audio assets into a Vite-friendly directory.
- Vite may need `assetsInclude: ['**/*.mp3']` or import.meta.url per file.

### 5. Tests

- Unit: chunk index → audio path resolution for a fixture paragraph.
- Manual: P&P Ch I–II, theatric on, tap reveals speech + sound.

---

## Text sent to Polly

Use the **exact dialogue chunk string** from `listDialogueChunkTexts` (includes `“…”` marks) **or** strip quotes and pass plain speech — pick one and stay consistent. Recommended:

- **Input:** chunk text with quotes removed, trimmed.
- **Do not** include narration after the quote (`said Mrs. Bennet`).
- **`c: true` paragraphs:** synth only the chunk as detected on probed text (same as speakers).

Store `pollyText` in a dry-run log for QA.

---

## Storage estimate (pilot)

- ~2 chapters of P&P: on the order of **50–150 dialogue chunks** (verify with dry-run count).
- ~5–15 s neural MP3 per chunk → **~2–8 MB** pilot total (acceptable).

Full book / six novels: plan a **separate size budget** before shipping to app stores; dialogue-only (not narration) keeps this bounded.

---

## Implementation phases (checklist for future agent)

### Phase A — Converter pilot (this repo)

- [ ] Add `docs/` voice map for P&P main cast.
- [ ] Implement `synth-dialogue-audio.ts` with `--book` / `--chapters` / `--dry-run` / `--force`.
- [ ] Add `validate-dialogue-audio`.
- [ ] Extend speaker sidecar schema (`audioChunks` parallel map).
- [ ] Extend `exportEpub.ts` + `dialogue-audio.json` + manifest entries.
- [ ] Run pilot; `npm run export-arpp -- --book=pride-and-prejudice`.
- [ ] Manual listen QA for Ch 1–2.

### Phase B — ARPP spec

- [ ] Update [`arpp.md`](arpp.md) with `dialogue-audio.json` and naming convention.
- [ ] Bump `ARPP_VERSION` if needed (ereader importer should tolerate unknown metadata gracefully).

### Phase C — Ereader (austen repo)

- [ ] Import audio metadata + files.
- [ ] Theatric playback hook + settings UI.
- [ ] Copy pilot EPUB to `publications/arpp/`.
- [ ] End-to-end test on device (offline airplane mode).

### Phase D — Scale (later)

- [ ] Full P&P → six books.
- [ ] CI guard: validate audio chunk counts on export.
- [ ] Optional: ambient chapter audio via existing `publication.json`.

---

## Pitfalls

| Issue | Mitigation |
|-------|------------|
| Audio / speaker array length mismatch | Same loop as `listDialogueChunkTexts`; share validation with `validate-speakers`. |
| `{ c: true }` paragraph | Pass `dialogueContinuation` into chunk list (already done for speakers). |
| Re-synth overwrites manual QA | Skip existing files unless `--force`; version `source.generatedAt` in sidecar. |
| EPUB size | Dialogue only; MP3 22kHz mono for speech is enough. |
| Theatric step vs chunk index | Reuse `theatricChunkOffsets` / global index in ReaderPage — audio hook must use **same index** as visible reveal. |
| Double-play on fast taps | Stop previous `HTMLAudioElement` on new reveal. |

---

## References

| Topic | Location |
|-------|----------|
| Dialogue chunk regex | `src/lib/dialogueChunks.ts` |
| Speaker sidecar | `src/data/speakers/`, [`docs/formats.md`](formats.md) |
| ARPP export | `src/lib/arpp/exportEpub.ts` |
| Theatric reveal | `austen` → `Reader.tsx`, `ReaderPage.tsx`, `AGENTS.md` |
| AWS Polly API | [SynthesizeSpeech](https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html) |

---

## Out of scope (v1)

- Live Polly from the client.
- Narration (non-dialogue paragraphs).
- Word-level lip-sync / Media Overlays SMIL.
- SSML stage directions / emotion tags (v2).
