import { describe, expect, it } from "vitest";
import type { Book } from "@/lib/bookTypes";
import {
  parseTheatricProfile,
  validateTheatricAgainstBook,
  type TheatricProfile,
} from "@/lib/arpp/theatricProfile";

const tinyBook: Book = {
  id: "tiny-book",
  title: "Tiny",
  author: "T",
  chapters: [{ title: "Ch0", paragraphs: ["a", "b", "c"] }],
};

describe("theatricProfile", () => {
  it("parses scenes with doNow and embeddedTexts", () => {
    const p = parseTheatricProfile({
      schemaVersion: 1,
      bookId: "tiny-book",
      scenes: [
        {
          id: "sc0",
          startBlockId: "ch00-p000",
          endBlockId: "ch00-p002",
          doNow: ["Add ambient bed when assets exist", "Map: drawing room"],
          soundscape: { description: "fireplace", file: null },
          embeddedTexts: [
            {
              id: "lt0",
              startBlockId: "ch00-p001",
              endBlockId: "ch00-p001",
              kind: "letter",
              summary: "Test",
              doNow: ["Wax seal interaction"],
            },
          ],
        },
      ],
    });
    expect(p.scenes[0].doNow).toHaveLength(2);
    expect(p.scenes[0].soundscape?.file).toBeNull();
    expect(p.scenes[0].embeddedTexts?.[0].kind).toBe("letter");
    validateTheatricAgainstBook(tinyBook, p);
  });

  it("rejects bookId mismatch", () => {
    const p: TheatricProfile = {
      schemaVersion: 1,
      bookId: "wrong",
      scenes: [{ startBlockId: "ch00-p000", endBlockId: "ch00-p000" }],
    };
    expect(() => validateTheatricAgainstBook(tinyBook, p)).toThrow(/book\.id/);
  });

  it("rejects span outside book", () => {
    const p = parseTheatricProfile({
      schemaVersion: 1,
      bookId: "tiny-book",
      scenes: [{ startBlockId: "ch00-p000", endBlockId: "ch00-p099" }],
    });
    expect(() => validateTheatricAgainstBook(tinyBook, p)).toThrow(/out of range/);
  });
});
