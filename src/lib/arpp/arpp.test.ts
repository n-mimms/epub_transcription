import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { exportBookToArppEpub } from "@/lib/arpp/exportEpub";
import { importArppEpub } from "@/lib/arpp/importEpub";
import { audioEpubHref } from "@/lib/dialogueAudio";
import type { Book } from "@/lib/bookTypes";
import type { SpeakerAttributionFile } from "@/lib/speakerAttribution";
import { SPEAKER_ATTRIBUTION_SCHEMA_VERSION } from "@/lib/speakerAttribution";
import type { TheatricProfile } from "@/lib/arpp/theatricProfile";

const FIXTURE_BOOK: Book = {
  id: "arpp-fixture",
  title: "ARPP Fixture",
  author: "Test Author",
  chapters: [
    {
      title: "Chapter I",
      paragraphs: [
        "Narration only.",
        "“First line,” said he. “Second line.”",
        { text: "continued speech.”", c: true },
      ],
    },
  ],
};

const FIXTURE_SPEAKERS: SpeakerAttributionFile = {
  schemaVersion: SPEAKER_ATTRIBUTION_SCHEMA_VERSION,
  bookId: "arpp-fixture",
  chunks: {
    "0:1": ["Alice", "Bob"],
    "0:2": ["Alice"],
  },
};

describe("ARPP export / import", () => {
  it("round-trips book text and speaker chunks", async () => {
    const epub = await exportBookToArppEpub(FIXTURE_BOOK, FIXTURE_SPEAKERS);
    const { book, speakerAttribution, theatric } = await importArppEpub(epub);

    expect(book.id).toBe("arpp-fixture");
    expect(theatric).toBeNull();
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].paragraphs).toHaveLength(3);
    expect(book.chapters[0].paragraphs[0]).toBe("Narration only.");
    expect(book.chapters[0].paragraphs[1]).toBe("“First line,” said he. “Second line.”");
    expect(book.chapters[0].paragraphs[2]).toEqual({ text: "continued speech.”", c: true });

    expect(speakerAttribution?.chunks["0:1"]).toEqual(["Alice", "Bob"]);
    expect(speakerAttribution?.chunks["0:2"]).toEqual(["Alice"]);
  });

  it("embeds dialogue-audio.json and MP3 assets when audioChunks are set", async () => {
    const href = audioEpubHref("arpp-fixture", 0, 1, 0);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arpp-audio-"));
    const mp3Path = path.join(tmp, "audio", "arpp-fixture", "ch00-p001-0.mp3");
    fs.mkdirSync(path.dirname(mp3Path), { recursive: true });
    fs.writeFileSync(mp3Path, Buffer.from([0xff, 0xfb])); // minimal stub bytes

    const speakersWithAudio: SpeakerAttributionFile = {
      ...FIXTURE_SPEAKERS,
      audioChunks: {
        "0:1": [href],
      },
    };

    const epub = await exportBookToArppEpub(FIXTURE_BOOK, speakersWithAudio, {
      dataRoot: tmp,
    });
    const zip = await JSZip.loadAsync(epub);
    const dialogueAudio = await zip.file("OEBPS/metadata/dialogue-audio.json")?.async("string");
    expect(dialogueAudio).toBeTruthy();
    expect(JSON.parse(dialogueAudio!).chunks["ch00-p001"]).toEqual([href]);
    expect(zip.file(`OEBPS/${href}`)).toBeTruthy();
  });

  it("embeds theatric.json and round-trips when theatricProfile is set", async () => {
    const theatric: TheatricProfile = {
      schemaVersion: 1,
      bookId: "arpp-fixture",
      scenes: [
        {
          id: "fixture-scene-0",
          startBlockId: "ch00-p000",
          endBlockId: "ch00-p002",
          doNow: ["Soundscape: placeholder ambient loop"],
          soundscape: { description: "Quiet room tone", file: null },
          embeddedTexts: [
            {
              startBlockId: "ch00-p001",
              endBlockId: "ch00-p002",
              kind: "letter",
              summary: "Fixture letter span",
              presentation: { openInteraction: "wax_seal" },
              doNow: ["Implement seal swipe in ereader"],
            },
          ],
        },
      ],
    };

    const epub = await exportBookToArppEpub(FIXTURE_BOOK, FIXTURE_SPEAKERS, { theatricProfile: theatric });
    const zip = await JSZip.loadAsync(epub);
    const raw = await zip.file("OEBPS/metadata/theatric.json")?.async("string");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).scenes[0].doNow).toContain("Soundscape: placeholder ambient loop");

    const { theatric: imported } = await importArppEpub(epub);
    expect(imported?.bookId).toBe("arpp-fixture");
    expect(imported?.scenes[0].embeddedTexts?.[0].presentation).toEqual({ openInteraction: "wax_seal" });
  });

  it("bundles theatric soundscape MP3 when soundscape.file is set", async () => {
    const href = "audio/arpp-fixture/ch00-ambient.mp3";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arpp-theatric-audio-"));
    const diskPath = path.join(tmp, "audio", "arpp-fixture", "ch00-ambient.mp3");
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, Buffer.from([0xff, 0xfb]));

    const theatric: TheatricProfile = {
      schemaVersion: 1,
      bookId: "arpp-fixture",
      scenes: [
        {
          startBlockId: "ch00-p000",
          endBlockId: "ch00-p002",
          soundscape: { description: "fixture bed", file: href },
        },
      ],
    };

    const epub = await exportBookToArppEpub(FIXTURE_BOOK, FIXTURE_SPEAKERS, {
      theatricProfile: theatric,
      dataRoot: tmp,
    });
    const zip = await JSZip.loadAsync(epub);
    expect(zip.file(`OEBPS/${href}`)).toBeTruthy();
  });
});
