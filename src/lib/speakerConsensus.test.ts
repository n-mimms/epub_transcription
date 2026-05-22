import { describe, expect, it } from "vitest";
import {
  pluralityVoteDeliveriesPerChunk,
  pluralityVotePerChunk,
  resolveVoteRuns,
  resolveVoteTemperature,
} from "./speakerConsensus";

describe("pluralityVotePerChunk", () => {
  it("picks the majority speaker", () => {
    const votes = [
      ["Mr. Bennet", "Mrs. Bennet"],
      ["Mr. Bennet", "Elizabeth Bennet"],
      ["Mr. Bennet", "Mrs. Bennet"],
    ];
    expect(pluralityVotePerChunk(votes)).toEqual(["Mr. Bennet", "Mrs. Bennet"]);
  });

  it("returns null on a tie with no hint", () => {
    const votes = [
      ["Mr. Bennet", null],
      ["Mrs. Bennet", null],
    ];
    expect(pluralityVotePerChunk(votes)).toEqual([null, null]);
  });

  it("uses tie-break hint when provided", () => {
    const votes = [
      ["Mr. Bennet"],
      ["Mrs. Bennet"],
    ];
    expect(pluralityVotePerChunk(votes, ["Mr. Bennet"])).toEqual(["Mr. Bennet"]);
  });

  it("ignores null votes in the count", () => {
    const votes = [
      [null, "Mrs. Bennet"],
      ["Mrs. Bennet", "Mrs. Bennet"],
      [null, "Mrs. Bennet"],
    ];
    expect(pluralityVotePerChunk(votes)).toEqual(["Mrs. Bennet", "Mrs. Bennet"]);
  });
});

describe("pluralityVoteDeliveriesPerChunk", () => {
  it("picks majority delivery", () => {
    const votes = [
      ["whisper", "normal"],
      ["whisper", "shout"],
      ["normal", "normal"],
    ];
    expect(pluralityVoteDeliveriesPerChunk(votes)).toEqual(["whisper", "normal"]);
  });
});

describe("resolveVoteRuns", () => {
  it("defaults to 1", () => {
    const prev = process.env.ENCODE_VOTE_RUNS;
    delete process.env.ENCODE_VOTE_RUNS;
    expect(resolveVoteRuns()).toBe(1);
    if (prev) process.env.ENCODE_VOTE_RUNS = prev;
  });

  it("respects explicit argv value", () => {
    expect(resolveVoteRuns(3)).toBe(3);
  });
});

describe("resolveVoteTemperature", () => {
  it("defaults to 0.5", () => {
    const prev = process.env.ENCODE_VOTE_TEMPERATURE;
    delete process.env.ENCODE_VOTE_TEMPERATURE;
    expect(resolveVoteTemperature()).toBe(0.5);
    if (prev) process.env.ENCODE_VOTE_TEMPERATURE = prev;
  });
});
