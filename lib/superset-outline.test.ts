import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("the superset outline while dragging a member", () => {
  const hook = read("app/(dashboard)/clients/[id]/log/useDragOrder.ts");
  it("a member dropped outside the outline leaves the group; inside it stays", () => {
    expect(hook).toContain("d.outside ? ungroupAt(o, d.id, d.gap) : dropWithin(o, d.id, d.gap)");
  });
  it("outside is the finger leaving the group's span", () => {
    expect(hook).toContain("pageY < d.span.top || pageY > d.span.bottom");
  });
  it("every list (athlete, coach phone, coach desktop) draws the outline", () => {
    expect(read("components/athlete/WorkoutLogger.tsx")).toContain("<SupersetOutline box={drag.groupBox} />");
    const coach = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
    expect(coach).toContain("<SupersetOutline box={drag.groupBox} />");
    expect(coach).toContain("<SupersetOutline box={dragD.groupBox} />");
  });
  it("it is whole while inside and open (dashed) outside", () => {
    const c = read("components/logger/SupersetOutline.tsx");
    expect(c).toContain('box.broken ? "dashed" : "solid"');
    expect(c).toContain("Drop to ungroup");
  });
});
