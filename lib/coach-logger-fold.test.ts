import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx", import.meta.url), "utf8");

/** The coach logger opens with every card folded but the first one with sets left (declutter audit). */
describe("coach logger: folded by default", () => {
  it("starts with every exercise folded except the first one with sets left", () => {
    expect(src).toContain("const first = exercises.find(left);");
    expect(src).toContain("exercises.filter((ex) => ex !== first).map((ex) => [ex.aweId, true])");
  });
  it("a finished exercise still hands over to the next (override cleared, next one opened)", () => {
    expect(src).toContain("if (n != null) setTimeout(() => jumpTo(exercises[n]), 0);");
  });
});
