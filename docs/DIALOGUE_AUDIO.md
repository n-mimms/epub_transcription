# Dialogue audio — agent reference (converter)

**Status:** Converter pipeline **implemented** (synth + ARPP export). Ereader playback: see [`../austen/docs/PLAN_THEATRIC_SPEAK_ALOUD.md`](../../austen/docs/PLAN_THEATRIC_SPEAK_ALOUD.md).

Human workflow: [`README.md`](../README.md). Original cross-repo plan: [`POLLY_THEATRIC_AUDIO_PLAN.md`](POLLY_THEATRIC_AUDIO_PLAN.md).

---

## Design decisions (do not undo without intent)

| Decision | Rationale |
|----------|-----------|
| **Prerecorded MP3s in EPUB** | Instant tap-to-play; offline; no API keys in the browser |
| **ElevenLabs default** | Better expressiveness (whisper/shout/sarcasm via v3 audio tags) than Polly neural |
| **Polly optional** | `--provider=polly`; SSML prosody approximates delivery on neural |
| **Same index as theatric** | Audio chunk `k` = `k`th match of `listDialogueChunkTexts` = `chunks[k]` / `deliveryChunks[k]` |
| **Chapter-by-chapter synth** | Only after `chapterManualValidation`; see README workflow |
| **Parallel sidecar maps** | `chunks`, `deliveryChunks`, `audioChunks` share keys `"chapterIndex:paragraphIndex"` |

---

## Workflow (converter)

```text
encode-speakers (per chapter) → manual review → chapterManualValidation
  → synth-dialogue-audio (per chapter) → validate-dialogue-audio
  → export-arpp → copy EPUB to austen/publications/arpp/
```

**Do not** synth audio before speakers for that chapter are validated.

---

## Local files

| Path | Role |
|------|------|
| `src/data/voices/{bookId}.json` | Voice map v2: ElevenLabs + Polly per character |
| `src/data/audio/{bookId}/ch00-p002-0.mp3` | Generated MP3s |
| `src/data/speakers/{bookId}.json` | `audioChunks`, `deliveryChunks`, `chunks` |
| `exports/arpp/{bookId}.epub` | Bundled audio + metadata |

**MP3 naming:** `ch{CC}-p{PPP}-{K}.mp3` (0-based chapter, paragraph, chunk).

**EPUB href:** `audio/{bookId}/ch00-p002-0.mp3` (under `OEBPS/`).

---

## Voice map (`src/data/voices/*.json`)

```json
{
  "schemaVersion": 2,
  "bookId": "pride-and-prejudice",
  "defaultProvider": "elevenlabs",
  "elevenlabs": { "modelId": "eleven_v3", "defaultVoiceId": "…" },
  "polly": { "defaultVoice": { "pollyVoiceId": "Joanna", "pollyEngine": "neural" } },
  "characters": {
    "Mr. Bennet": {
      "elevenlabsVoiceId": "…",
      "polly": { "pollyVoiceId": "Matthew", "pollyEngine": "neural" }
    }
  }
}
```

- Schema v1 (flat `pollyVoiceId` per character) still loads for Polly-only maps.
- ElevenLabs IDs come from the user's ElevenLabs voice library; fallback: `elevenlabs.defaultVoiceId` or `ELEVEN_LABS_DEFAULT_VOICE_ID`.

---

## Speaker sidecar extensions

```json
{
  "chunks": { "0:2": ["Mrs. Bennet", "Mrs. Bennet"] },
  "deliveryChunks": { "0:2": ["normal", "shout"] },
  "audioChunks": {
    "0:2": [
      "audio/pride-and-prejudice/ch00-p002-0.mp3",
      "audio/pride-and-prejudice/ch00-p002-1.mp3"
    ]
  },
  "chapterManualValidation": { "0": { "validatedAt": "…" } },
  "source": { "audioProvider": "elevenlabs", "audioSynthAt": "…" }
}
```

**Delivery values:** `normal` | `whisper` | `shout` | `soft` | `emphatic` | `sarcastic` (see `src/lib/dialogueDelivery.ts`).

Encoder (`encode-speakers`) asks Gemini for parallel `deliveries[]` per paragraph; heuristics leave delivery as `normal` unless extended later.

---

## ARPP EPUB assets (export)

Produced by `exportBookToArppEpub` when `audioChunks` exist and files are on disk:

| Asset | Content |
|-------|---------|
| `OEBPS/audio/{bookId}/*.mp3` | Binary MPEG audio |
| `OEBPS/metadata/dialogue-audio.json` | `{ schemaVersion, bookId, chunks: { "ch00-p002": ["audio/…/ch00-p002-0.mp3", …] } }` |
| `OEBPS/metadata/characters.json` | Roster + per-character `voices` + top-level `audio` / `audioSynthProvider` |
| `OEBPS/metadata/speakers.json` | Block-id keys; includes `deliveryChunks` when present |

**Key spaces:**

- Sidecar / authoring: `"chapterIndex:paragraphIndex"` (e.g. `"0:2"`).
- EPUB `dialogue-audio.json` / `speakers.json`: block ids (`ch00-p002`).

Importer (converter `importEpub.ts`) maps block ids ↔ chapter:paragraph for round-trip. Ereader importer must do the same.

---

## TTS implementation

| Module | Role |
|--------|------|
| `src/lib/dialogueDelivery.ts` | Delivery normalization; Polly SSML; ElevenLabs text tags |
| `src/lib/dialogueVoices.ts` | Voice map load + resolve per provider |
| `src/lib/tts/elevenLabs.ts` | `POST /v1/text-to-speech/{voice_id}` |
| `src/lib/tts/polly.ts` | `SynthesizeSpeech` with `TextType: ssml` |
| `scripts/synth-dialogue-audio.ts` | CLI orchestration |

**Polly neural:** `<amazon:effect name="whispered">` is **not** supported; whisper uses `<prosody volume="x-soft">` (see [Polly SSML support](https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html)).

**ElevenLabs:** `[whispers]`, `[shouts]`, `[sarcastically]`, etc. prepended to speech text (`eleven_v3`).

---

## Commands

| Command | Notes |
|---------|--------|
| `npm run synth-dialogue-audio --book=… --chapters=0` | Windows: often **no** `--` before flags |
| `npm run validate-dialogue-audio` | Lengths + files on disk |
| `npm run export-arpp --book=…` | Fails if referenced MP3s missing |

**Env (`.env`):** `ELEVEN_LABS`, `GOOGLE_API_KEY`, optional `AWS_*` for Polly.

**Windows argv:** `scripts/run-synth-dialogue-audio.mjs` reads `npm_config_book`, `npm_config_chapters`, or `SYNTH_BOOK`, `SYNTH_CHAPTERS`.

Loader: `scripts/load-env.mjs` (shared with `encode-speakers` launchers).

---

## Pitfalls for agents

1. **Index confusion:** `"1:1"` = chapter 2, paragraph 2 — not “Chapter I”.
2. **Export without synth:** `audioChunks` in sidecar but no files → export throws.
3. **Re-synth:** Existing MP3s skipped unless `--force`.
4. **Missing ElevenLabs voice:** Set `elevenlabsVoiceId` per character or `defaultVoiceId`.
5. **Delivery without re-encode:** Old sidecars lack `deliveryChunks` → synth treats all as `normal`.
6. **Do not call TTS from the ereader** — only play bundled files.

---

## Tests

- `src/lib/dialogueDelivery.test.ts` — SSML / tags
- `src/lib/dialogueAudio.test.ts` — paths
- `src/lib/arpp/arpp.test.ts` — EPUB embeds `dialogue-audio.json` + MP3 stub

---

## Handoff checklist for ereader agent

- [ ] Import `dialogue-audio.json` + copy/expose MP3 URLs at build time
- [ ] Extend `Book` / `speakerAttribution` types with `dialogueAudio` or `audioChunks`
- [ ] Map global theatric chunk index → audio URL (same math as `ReaderPage` `gIdx`)
- [ ] Settings: `speakAloud` (theatric only); volume optional
- [ ] On reveal (`theatricStep` increment): play clip if enabled and URL exists; **no-op** if missing
- [ ] Stop previous `HTMLAudioElement` on fast taps / page change

See austen plan doc for UI and file touch list.
