import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../../components/athlete/PlanView.tsx", import.meta.url), "utf8");

describe("Plan tab (static)", () => {
  it("has no 'lighter every 4th week' explainer, and no explainer line by the week heading", () => {
    expect(src).not.toMatch(/every 4th week/i);
    expect(src).not.toMatch(/never count as a record or a stall/);
    expect(src).not.toContain("Lighter week — recover");
    expect(src).not.toMatch(/block\?\.focus/);
  });
  it("keeps the workout's note box closed until 'Add note' is tapped", () => {
    expect(src).not.toContain("Notes for this workout");
    expect(src).toMatch(/editing \? \(\s*<NoteField/);
    expect(src).toContain("Add note");
    expect(src).toContain("Edit note");
  });
  it("lists past sessions' notes under the workout", () => {
    expect(src).toContain("Past sessions");
    expect(src).toMatch(/w\.history\.map/);
  });
  it("has the named hook for 'Atlas suggests changes from your notes', and it renders nothing", () => {
    expect(src).toMatch(/function AtlasSuggestsFromNotes\([^)]*\) \{\s*return null;\s*\}/);
    expect(src).toContain("<AtlasSuggestsFromNotes");
  });
});
