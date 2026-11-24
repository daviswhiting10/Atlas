import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const s = readFileSync(new URL("../components/coach/ExerciseLibrary.tsx", import.meta.url), "utf8");

describe("Exercises: five rows, then Show all", () => {
  it("lists the first FIRST_ROWS (5) rows until Show all is tapped", () => {
    expect(s).toContain("const FIRST_ROWS = 5;");
    expect(s).toContain("(showAll || query ? shown : shown.slice(0, FIRST_ROWS))");
    expect(s).toContain("Show all {shown.length}");
  });
  it("a search always looks through the whole library, and switching the filter folds the list again", () => {
    expect(s).toMatch(/showAll \|\| query \?/);
    expect(s).toMatch(/setQuery\(""\);\s*setShowAll\(false\);/);
  });
});
