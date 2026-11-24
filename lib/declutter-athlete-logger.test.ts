import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const s = readFileSync(new URL("../components/athlete/WorkoutLogger.tsx", import.meta.url), "utf8");

describe("Athlete logger: Add a set is in the card's ⋯", () => {
  it("the menu offers Add a set (first), then Swap", () => {
    const menu = s.indexOf("Add a set</DropdownMenuItem>");
    expect(menu).toBeGreaterThan(0);
    expect(menu).toBeLessThan(s.indexOf(">Swap</DropdownMenuItem>"));
  });
  it("there is no Add set button under the sets any more", () => {
    expect(s).not.toContain("<Plus className=\"h-3.5 w-3.5\" /> Add set");
  });
});
