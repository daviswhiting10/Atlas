import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const s = readFileSync(new URL("../components/athlete/WorkoutLogger.tsx", import.meta.url), "utf8");

describe("Athlete logger: Add set is a row under the sets, not in the ⋯", () => {
  it("the menu no longer has Add a set; Swap is first", () => {
    expect(s).not.toContain("Add a set</DropdownMenuItem>");
    expect(s).toContain(">Swap</DropdownMenuItem>");
  });
  it("a tappable Add set row sits below each exercise's sets", () => {
    expect(s.indexOf("</ul>\n                      <button type=\"button\" onClick={() => addSet(ex)}")).toBeGreaterThan(0);
  });
});
