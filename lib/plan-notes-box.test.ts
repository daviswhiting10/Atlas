import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("the coaching notes box", () => {
  const plan = read("components/athlete/PlanView.tsx");
  it("is 4 lines tall to start, grows to 12 and then scrolls", () => {
    expect(plan).toContain("grow={{ min: 4, max: 12 }}");
    expect(plan).toContain("useAutoGrow(box, text, grow?.min ?? 2, grow?.max ?? 2)");
  });
  it("fills its column and sizes itself (no drag handle)", () => {
    expect(plan).toContain('grow ? "resize-none" : "resize-y"');
    expect(plan).toContain("block w-full");
  });
  it("other notes fields on the page are unchanged (2 lines, resizable)", () => {
    expect(plan).toContain("rows={grow?.min ?? 2}");
  });
});
