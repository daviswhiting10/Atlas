import { describe, expect, it } from "vitest";
import { firstText, noThinking } from "./blocks";

describe("firstText", () => {
  it("skips a thinking block", () => {
    expect(firstText([{ type: "thinking" }, { type: "text", text: '{"a":1}' }])).toBe('{"a":1}');
  });
  it("is empty when there is no text", () => {
    expect(firstText([{ type: "thinking" }])).toBe("");
    expect(firstText([])).toBe("");
  });
});

describe("noThinking", () => {
  it("turns thinking off for Sonnet 5.5", () => {
    expect(noThinking("claude-sonnet-5-5", "claude-sonnet-5-5")).toEqual({ thinking: { type: "between_tools" } });
  });
  it("leaves other models alone", () => {
    expect(noThinking("claude-haiku-4-5-20251001", "claude-sonnet-5-5")).toEqual({});
  });
});
