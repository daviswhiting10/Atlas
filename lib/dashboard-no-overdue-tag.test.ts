import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const s = readFileSync(new URL("../app/(dashboard)/dashboard/DashboardView.tsx", import.meta.url), "utf8");
describe("coach Dashboard: Overdue is a filter, not a tag", () => {
  it("no OVERDUE tag or warn border on the cards; the chip stays", () => {
    expect(s).not.toContain(">Overdue</span>");
    expect(s).not.toContain("border-warn");
    expect(s).toContain('chip("overdue", "Overdue", counts.overdue)');
  });
});
