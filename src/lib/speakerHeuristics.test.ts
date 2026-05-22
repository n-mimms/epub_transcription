import { describe, expect, it } from "vitest";
import { mergeHeuristicAndLlm, type HeuristicSource } from "./speakerHeuristics";

describe("mergeHeuristicAndLlm", () => {
  it("overrides LLM with tag and addresser sources only", () => {
    const heuristic = { "1:0": ["Mrs. Bennet", null] };
    const llm = { "1:0": ["Elizabeth Bennet", "Mr. Bennet"] };
    const sources: Record<string, (HeuristicSource | null)[]> = { "1:0": ["tag", null] };
    expect(mergeHeuristicAndLlm(heuristic, llm, sources)).toEqual({
      "1:0": ["Mrs. Bennet", "Mr. Bennet"],
    });
  });

  it("does not override LLM with ping-pong heuristic", () => {
    const heuristic = { "1:4": ["Elizabeth Bennet"] };
    const llm = { "1:4": ["Mrs. Bennet"] };
    const sources: Record<string, (HeuristicSource | null)[]> = { "1:4": ["pingpong"] };
    expect(mergeHeuristicAndLlm(heuristic, llm, sources)).toEqual({
      "1:4": ["Mrs. Bennet"],
    });
  });

  it("falls back to legacy override when sources omitted", () => {
    const heuristic = { "1:0": ["Mr. Bennet"] };
    const llm = { "1:0": [null] };
    expect(mergeHeuristicAndLlm(heuristic, llm)).toEqual({ "1:0": ["Mr. Bennet"] });
  });
});
