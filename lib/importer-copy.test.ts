import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("importer copy cuts", () => {
  const upload = read("components/coach/SheetPlanUpload.tsx");
  const plan = read("app/(dashboard)/clients/[id]/programs/[assignmentId]/page.tsx");
  it("'N exercises · week 1 started <date>' is gone from the Read-as panel; the Read-as line stays", () => {
    expect(upload).not.toMatch(/exercises · week 1 started/);
    // (selfserve-empty's "Saving N weeks, N exercises…" progress line is a different line and stays.)
    expect(upload).not.toMatch(/\{summary\.exercises\} exercises ·/);
    expect(upload).toContain("Read as {summary.readAs}");
  });
  it("the library-program sentence is gone", () => {
    expect(plan).not.toContain("Built from a library program");
    expect(plan).not.toContain("lighter weeks are off unless you turn them on below");
  });
  it("the rest of that panel is as it was (the day list, the history line)", () => {
    expect(upload).toContain("summary.days.map((d)");
    expect(upload).toContain("progress charts fill in now");
  });
});
