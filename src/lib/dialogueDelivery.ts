/**
 * Stage direction / delivery hints per dialogue chunk (parallel to speaker names).
 */

export const DIALOGUE_DELIVERIES = [
  "normal",
  "whisper",
  "shout",
  "soft",
  "emphatic",
  "sarcastic",
] as const;

export type DialogueDelivery = (typeof DIALOGUE_DELIVERIES)[number];

export function normalizeDelivery(raw: string | null | undefined): DialogueDelivery {
  if (!raw || !String(raw).trim()) return "normal";
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  const aliases: Record<string, DialogueDelivery> = {
    normal: "normal",
    default: "normal",
    whisper: "whisper",
    whispered: "whisper",
    whispering: "whisper",
    shout: "shout",
    shouted: "shout",
    shouting: "shout",
    yell: "shout",
    yelled: "shout",
    soft: "soft",
    softly: "soft",
    quiet: "soft",
    emphatic: "emphatic",
    emphasis: "emphatic",
    stressed: "emphatic",
    excited: "emphatic",
    sarcastic: "sarcastic",
    sarcasm: "sarcastic",
    dry: "sarcastic",
  };
  return aliases[key] ?? "normal";
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Best-effort SSML for Polly neural (whispered effect is not supported on neural). */
export function pollySsmlFromSpeech(speech: string, delivery: DialogueDelivery): string {
  const inner = escapeXml(speech);
  switch (delivery) {
    case "whisper":
      return `<speak><prosody volume="x-soft" rate="85%">${inner}</prosody></speak>`;
    case "shout":
      return `<speak><prosody volume="loud" rate="110%">${inner}</prosody></speak>`;
    case "soft":
      return `<speak><prosody volume="soft" rate="90%">${inner}</prosody></speak>`;
    case "emphatic":
      return `<speak><emphasis level="strong">${inner}</emphasis></speak>`;
    case "sarcastic":
      return `<speak><prosody pitch="-8%" rate="92%">${inner}</prosody></speak>`;
    default:
      return `<speak>${inner}</speak>`;
  }
}

/** Eleven v3 audio tags — see ElevenLabs text-to-dialogue docs. */
export function elevenLabsTextFromSpeech(speech: string, delivery: DialogueDelivery): string {
  switch (delivery) {
    case "whisper":
      return `[whispers] ${speech}`;
    case "shout":
      return `[shouts] ${speech}`;
    case "soft":
      return `[softly] ${speech}`;
    case "emphatic":
      return `[excited] ${speech}`;
    case "sarcastic":
      return `[sarcastically] ${speech}`;
    default:
      return speech;
  }
}
