import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const s = readFileSync(new URL("../app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx", import.meta.url), "utf8");

describe("Coach logger: the per-set options button only where it can be wanted", () => {
  it("shows it on the next set, on logged sets, on sets with a note or RPE, on band and bodyweight sets, and when open", () => {
    expect(s).toContain("const showDetails = open || extra || entry.completed || entry.isBand || entry.isBodyweight || idx === sets.findIndex((x) => !x.completed);");
  });
  it("a set still to do and not next is just its number", () => {
    expect(s).toMatch(/\{showDetails \? \([\s\S]{0,400}load type, RPE and note[\s\S]{0,600}\) : \(\s*\/\/[^\n]*\n\s*<span/);
  });
});
