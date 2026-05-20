import { describe, expect, it } from "vitest";
import {
  audioBasename,
  audioEpubHref,
  chunkMapKeyToBlockId,
  pollyTextFromChunk,
} from "@/lib/dialogueAudio";

describe("dialogueAudio", () => {
  it("builds stable EPUB hrefs and block ids", () => {
    expect(audioBasename(0, 2, 1)).toBe("ch00-p002-1.mp3");
    expect(audioEpubHref("pride-and-prejudice", 0, 2, 1)).toBe(
      "audio/pride-and-prejudice/ch00-p002-1.mp3",
    );
    expect(chunkMapKeyToBlockId("0:2")).toBe("ch00-p002");
  });

  it("strips quotes for Polly text", () => {
    expect(pollyTextFromChunk("“Hello,”")).toBe("Hello,");
    expect(pollyTextFromChunk('"Hi."')).toBe("Hi.");
  });
});
