import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Log a workout: four recent exercises as chips, the rest are one search away", () => {
  const s = readFileSync(new URL("../components/sessions/QuickLog.tsx", import.meta.url), "utf8");
  it("shows at most RECENT_SHOWN (4) chips", () => {
    expect(s).toContain("export const RECENT_SHOWN = 4;");
    expect(s).toContain(".slice(0, RECENT_SHOWN)");
  });
  it("still has Add exercise (the search) for everything else", () => {
    expect(s).toContain('aria-label="Add an exercise"');
  });
});
