import { describe, expect, it } from "vitest";
import { GROUP_WORD, countsTowardVolume, exerciseGroup } from "./muscles";

describe("exerciseGroup", () => {
  it("maps library muscle words to chart groups", () => {
    expect(exerciseGroup(["quadriceps", "glutes"])).toBe("Quads");
    expect(exerciseGroup(["quads"])).toBe("Quads");
    expect(exerciseGroup(["middle back"])).toBe("Back");
    expect(exerciseGroup(["abductors"])).toBe("Glutes & hips");
    expect(exerciseGroup(["forearms"])).toBe("Arms");
    expect(exerciseGroup([])).toBeNull();
    expect(exerciseGroup(null)).toBeNull();
  });

  it("keeps conditioning and mobility out of volume", () => {
    expect(countsTowardVolume(exerciseGroup(["conditioning"]))).toBe(false);
    expect(countsTowardVolume(exerciseGroup(["mobility"]))).toBe(false);
    expect(countsTowardVolume(exerciseGroup(["chest"]))).toBe(true);
  });

  it("reads back every hand-assigned group", () => {
    for (const [g, w] of Object.entries(GROUP_WORD)) expect(exerciseGroup([w])).toBe(g);
  });
});
