import { describe, expect, it } from "vitest";
import {
  elevenLabsTextFromSpeech,
  normalizeDelivery,
  pollySsmlFromSpeech,
} from "@/lib/dialogueDelivery";

describe("dialogueDelivery", () => {
  it("normalizes delivery aliases", () => {
    expect(normalizeDelivery("whispered")).toBe("whisper");
    expect(normalizeDelivery("SHOUTING")).toBe("shout");
  });

  it("builds Polly SSML with prosody for whisper on neural", () => {
    expect(pollySsmlFromSpeech("Hello", "whisper")).toContain("<prosody");
    expect(pollySsmlFromSpeech("Hello", "normal")).toBe("<speak>Hello</speak>");
  });

  it("prefixes ElevenLabs v3 audio tags", () => {
    expect(elevenLabsTextFromSpeech("Hello", "whisper")).toBe("[whispers] Hello");
    expect(elevenLabsTextFromSpeech("Hello", "shout")).toBe("[shouts] Hello");
  });
});
