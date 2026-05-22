import { describe, expect, it } from "vitest";
import { wantsCliHelp } from "./speakerCliHelp";

describe("wantsCliHelp", () => {
  it("detects -help and --help", () => {
    expect(wantsCliHelp(["-help"])).toBe(true);
    expect(wantsCliHelp(["--help"])).toBe(true);
    expect(wantsCliHelp(["-h"])).toBe(true);
  });

  it("ignores other flags", () => {
    expect(wantsCliHelp(["--book=emma"])).toBe(false);
    expect(wantsCliHelp([])).toBe(false);
  });
});
