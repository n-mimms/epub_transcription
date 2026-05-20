import type { DialogueDelivery } from "@/lib/dialogueDelivery";

export type TtsProviderId = "elevenlabs" | "polly";

export interface DialogueSynthJob {
  bookId: string;
  chapterIndex: number;
  paragraphIndex: number;
  chunkIndex: number;
  speaker: string | null;
  speech: string;
  delivery: DialogueDelivery;
  diskPath: string;
  epubHref: string;
}

export interface ResolvedVoice {
  provider: TtsProviderId;
  /** Polly voice name or ElevenLabs voice_id */
  voiceId: string;
  pollyEngine?: string;
  elevenLabsModelId?: string;
}
