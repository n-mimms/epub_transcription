/**
 * Per-book voice map for Polly and ElevenLabs.
 */

import fs from "fs";
import path from "path";
import type { TtsProviderId } from "@/lib/tts/types";

export type PollyEngine = "neural" | "standard" | "generative" | "long-form";

export interface PollyVoiceRef {
  pollyVoiceId: string;
  pollyEngine?: PollyEngine;
}

export interface CharacterVoiceEntry {
  polly?: PollyVoiceRef;
  elevenlabsVoiceId?: string;
}

/** schemaVersion 2 — dual provider. schemaVersion 1 — Polly-only (legacy). */
export interface DialogueVoiceMap {
  schemaVersion: 1 | 2;
  bookId: string;
  defaultProvider?: TtsProviderId;
  elevenlabs?: {
    modelId?: string;
    defaultVoiceId?: string;
  };
  polly?: {
    defaultVoice: PollyVoiceRef;
  };
  /** Legacy v1 */
  defaultVoice?: PollyVoiceRef;
  characters: Record<string, CharacterVoiceEntry | PollyVoiceRef>;
}

export interface ResolvedCharacterVoice {
  provider: TtsProviderId;
  polly?: PollyVoiceRef;
  elevenlabsVoiceId?: string;
  elevenLabsModelId: string;
}

function isLegacyPollyRef(v: CharacterVoiceEntry | PollyVoiceRef): v is PollyVoiceRef {
  return "pollyVoiceId" in v && typeof (v as PollyVoiceRef).pollyVoiceId === "string";
}

function normalizeCharacterEntry(v: CharacterVoiceEntry | PollyVoiceRef): CharacterVoiceEntry {
  if (isLegacyPollyRef(v)) return { polly: v };
  return v;
}

export function loadDialogueVoiceMap(voicesDir: string, bookId: string): DialogueVoiceMap {
  const filePath = path.join(voicesDir, `${bookId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Voice map not found: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as DialogueVoiceMap;
  if (raw.bookId !== bookId) {
    throw new Error(`Voice map bookId mismatch: ${filePath}`);
  }
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) {
    throw new Error(`Unsupported voice map schema: ${filePath}`);
  }
  const hasPolly =
    (raw.schemaVersion === 1 && raw.defaultVoice?.pollyVoiceId) ||
    (raw.schemaVersion === 2 && raw.polly?.defaultVoice?.pollyVoiceId);
  if (!hasPolly && raw.schemaVersion === 1) {
    throw new Error(`Invalid voice map: ${filePath}`);
  }
  return raw;
}

export function defaultTtsProvider(map: DialogueVoiceMap): TtsProviderId {
  return map.defaultProvider ?? "elevenlabs";
}

export function resolveCharacterVoice(
  map: DialogueVoiceMap,
  speakerName: string | null | undefined,
  provider: TtsProviderId,
): ResolvedCharacterVoice {
  const entry = speakerName ? normalizeCharacterEntry(map.characters[speakerName] ?? {}) : {};
  const modelId =
    map.elevenlabs?.modelId ?? process.env.ELEVEN_LABS_MODEL ?? "eleven_v3";

  if (provider === "elevenlabs") {
    const voiceId =
      entry.elevenlabsVoiceId ??
      map.elevenlabs?.defaultVoiceId ??
      process.env.ELEVEN_LABS_DEFAULT_VOICE_ID?.trim();
    if (!voiceId) {
      throw new Error(
        `No ElevenLabs voice for ${speakerName ?? "(default)"}: set elevenlabsVoiceId in voice map, elevenlabs.defaultVoiceId, or ELEVEN_LABS_DEFAULT_VOICE_ID`,
      );
    }
    return { provider, elevenlabsVoiceId: voiceId, elevenLabsModelId: modelId };
  }

  const legacyDefault = map.defaultVoice;
  const pollyDefault = map.polly?.defaultVoice ?? legacyDefault;
  const polly = entry.polly ?? pollyDefault;
  if (!polly?.pollyVoiceId) {
    throw new Error(`No Polly voice for ${speakerName ?? "(default)"}`);
  }
  return {
    provider: "polly",
    polly: { pollyVoiceId: polly.pollyVoiceId, pollyEngine: polly.pollyEngine ?? "neural" },
    elevenLabsModelId: modelId,
  };
}

/** Merge voice assignments into ARPP character roster for export. */
export function characterVoicesForExport(
  map: DialogueVoiceMap,
  characterName: string,
): {
  pollyVoiceId?: string;
  pollyEngine?: string;
  elevenlabsVoiceId?: string;
} {
  const entry = normalizeCharacterEntry(map.characters[characterName] ?? {});
  const legacyDefault = map.defaultVoice;
  const polly = entry.polly ?? map.polly?.defaultVoice ?? legacyDefault;
  return {
    ...(polly?.pollyVoiceId
      ? { pollyVoiceId: polly.pollyVoiceId, pollyEngine: polly.pollyEngine ?? "neural" }
      : {}),
    ...(entry.elevenlabsVoiceId ? { elevenlabsVoiceId: entry.elevenlabsVoiceId } : {}),
  };
}

export function voiceMapAudioMeta(map: DialogueVoiceMap): Record<string, unknown> {
  return {
    defaultProvider: defaultTtsProvider(map),
    elevenlabs: {
      modelId: map.elevenlabs?.modelId ?? "eleven_v3",
      ...(map.elevenlabs?.defaultVoiceId ? { defaultVoiceId: map.elevenlabs.defaultVoiceId } : {}),
    },
    polly: map.polly?.defaultVoice ?? map.defaultVoice,
  };
}
