# Gemini speaker sidecars

Fill `src/data/speakers/{bookId}.json` with **Google Gemini** dialogue attribution. The encoder sends each chapter to the model with **pre-split dialogue chunks** (same regex as the reader), a **JSON character roster** (canonical names + aliases from `characters.ts`), and for chapter index ≥ 1 a **closing excerpt** of the previous chapter (same API call — no extra request).

## Prerequisites

1. **API key** from [Google AI Studio](https://aistudio.google.com/apikey).

2. Set **`GOOGLE_API_KEY`** in your shell (never commit the key):

   **PowerShell (session):**

   ```powershell
   $env:GOOGLE_API_KEY = "your-key-here"
   ```

   **macOS / Linux:**

   ```bash
   export GOOGLE_API_KEY=your-key-here
   ```

3. Optional: **`GEMINI_MODEL`** (default `gemini-2.5-flash`). Also supported: `gemini-3.1-flash-lite`, `gemma-4-26b-a4b-it`.
4. Optional: **`GEMINI_FALLBACK_MODEL`** (default `gemma-4-26b-a4b-it`) — after retries are exhausted on a **429**, the encoder prints a loud banner and switches to this model for the rest of the run.
5. Optional: **`GEMINI_MAX_RETRIES`** or **`ENCODE_MAX_RETRIES`** (default `6`) — exponential backoff on transient 429/503 (not billing quota exhaustion; those fail immediately and may switch to `GEMINI_FALLBACK_MODEL`).
6. Optional: **`ENCODE_VOTE_RUNS`** / `--vote-runs=N` (default `1`) — run Gemini **N times** per chapter and take a **majority vote** per dialogue chunk. Costs ~N× API calls. Use `ENCODE_VOTE_TEMPERATURE` (default `0.5`) for sampling when N > 1.

## Commands

From the project root:

```bash
# Full flag / model / env reference (npm may intercept --help; use :help scripts)
npm run encode-speakers:help
npm run benchmark-speaker-prompts:help
# Or: node scripts/run-encode-speakers.mjs -help
```

```bash
# Smoke test (no API call): chapter stats + prompt size
npm run encode-speakers -- --dry-run --book=pride-and-prejudice --chapter=1

# One chapter (good first real test — Chapter II = index 1)
npm run encode-speakers -- --book=pride-and-prejudice --chapter=1

# Whole book
npm run encode-speakers -- --book=emma

# All six bundled books (~300–400 API calls)
npm run encode-speakers

# After encoding, verify chunk array lengths
npm run validate-speakers
```

**Windows / npm:** PowerShell often drops flags after `--`, so the script sees `argv: (none)` and would encode **all chapters**. Use one of:

```powershell
# Reliable: call launcher directly
node scripts/run-encode-speakers.mjs --book=pride-and-prejudice --chapter=0

# Or pass flags as npm config (no -- separator)
npm run encode-speakers --book=pride-and-prejudice --chapter=0

# Or env
$env:ENCODE_BOOK = "pride-and-prejudice"
$env:ENCODE_CHAPTER = "0"
npm run encode-speakers
```

Chapter index **0** is valid (Chapter I). Confirm the log shows `chapter: 0`, not `(all)`.

### Flags and env

| Flag | Env alias | Purpose |
|------|-----------|---------|
| `--book=slug` | `ENCODE_BOOK` | Single book under `src/data/books/` |
| `--chapter=N` | `ENCODE_CHAPTER` | 0-based chapter index only |
| `--dry-run` | `ENCODE_DRY_RUN=1` | No API calls; log stats |
| `--skip-chapters=0,1` | `ENCODE_SKIP_CHAPTERS` | Skip chapter indexes |
| `--force-validated` | `ENCODE_FORCE_VALIDATED=1` | Overwrite `chapterManualValidation` chapters |
| `--vote-runs=N` | `ENCODE_VOTE_RUNS` | Majority vote across N LLM runs per chapter (default 1) |
| — | `ENCODE_VOTE_TEMPERATURE` | Sampling temperature when `vote-runs` > 1 (default 0.5) |
| `--no-progress` | — | One log line per chapter |

The script writes the sidecar **after each chapter** so a mid-run failure keeps prior chapters.

## Manual review

Chapters listed in sidecar `chapterManualValidation` are skipped on re-encode unless you pass `--force-validated`.

## Majority voting (opt-in)

Default encoding uses **one** Gemini call per chapter. For harder chapters, enable voting:

```powershell
$env:ENCODE_VOTE_RUNS = "3"
npm run encode-speakers -- --book=pride-and-prejudice --chapter=1
```

Or: `node scripts/run-encode-speakers.mjs --book=pride-and-prejudice --chapter=1 --vote-runs=3`

Sidecar `source.encoder` becomes e.g. `google-gemini-2.5-flash@vote3` with `source.voteRuns` and `source.voteTemperature` recorded.

Implementation: [`src/lib/speakerConsensus.ts`](../src/lib/speakerConsensus.ts).

## Cost and rate limits

- One API call per chapter by default (not per paragraph). With `--vote-runs=N`, expect **N calls** per chapter.
- Gemini Flash is typically fast and inexpensive vs batch CoreNLP on CPU.
- On HTTP 429 the encoder retries with backoff; if retries are still exhausted, it **switches to `GEMINI_FALLBACK_MODEL`** (Gemma 4 26B by default) for remaining chapters.

## Output metadata

Sidecar `source.encoder` is set to `google-gemini-2.5-flash` (or your `GEMINI_MODEL` value). Character names are canonicalized via [`src/lib/characters.ts`](../src/lib/characters.ts) and [`canonicalizeSpeaker`](../src/lib/speakerAttribution.ts).

**Hybrid attribution:** each chapter runs rule-based heuristics first ([`speakerHeuristics.ts`](../src/lib/speakerHeuristics.ts) — speech tags, orphan “addressed … with”, ping-pong for untagged quotes), then Gemini (or majority vote when enabled). Only **speech-tag** and **addresser** heuristics override the model; **ping-pong** guesses do not (reduces Elizabeth over-attribution on untagged lines).

Compare prompt variants on P&P Chapter II against **manual labels** in `src/data/speakers/pride-and-prejudice.json` (keys `1:*`):

```bash
npm run benchmark-speaker-prompts -- --heuristics-only   # no API
GOOGLE_API_KEY=... npm run benchmark-speaker-prompts     # all prompt variants
GOOGLE_API_KEY=... npm run benchmark-speaker-compare-models   # baseline + Gemini 3.1 Flash Lite + Gemma 4 26B
GOOGLE_API_KEY=... npm run benchmark-speaker-prompts -- --variant=current --vote-runs=3
```

Each LLM variant reports **`[llm-only]`**, **`[production]`** (tag/addresser merge), and when `--vote-runs` > 1, **`[voteN+production]`**.

`benchmark-speaker-compare-models` runs the **`current`** prompt on:

| Model ID | Role |
|----------|------|
| `gemini-2.5-flash` | Baseline (default encoder) |
| `gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite |
| `gemma-4-26b-a4b-it` | Gemma 4 26B (429 fallback default) |

Skip baseline (quota exhausted on 2.5 Flash):

```powershell
npm run benchmark-speaker-compare-alt
# or
$env:BENCHMARK_MODELS = "gemini-3.1-flash-lite,gemma-4-26b-a4b-it"
npm run benchmark-speaker-prompts -- --variant=current
# or skip from full compare:
npm run benchmark-speaker-compare-models -- --skip-models=gemini-2.5-flash
```

On Windows, `npm run … -- --models=…` may not forward flags; use the scripts above, `BENCHMARK_MODELS`, or `node scripts/run-benchmark-speaker-prompts.mjs --variant=current --models=…` directly. The benchmark logs `[benchmark] models:` at startup so you can confirm what will run.

Edit that sidecar to refine ground truth; tests load it via `speakerBenchmarkGroundTruth.ts`.

Heuristics-only encode (no API): `ENCODE_HEURISTICS_ONLY=1 npm run encode-speakers -- --book=pride-and-prejudice --chapter=1`
