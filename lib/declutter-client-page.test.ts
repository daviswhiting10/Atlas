import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Client page: two fewer targets on the first screen", () => {
  it("the latest session card has one link to the session (its title), not a second 'All sets'", () => {
    const s = src("components/coach/LatestSession.tsx");
    expect(s).not.toContain("All sets");
    expect(s).toContain("/sessions/${s.logId}");
  });
  it("the progress report row sits under the tabs, not above them", () => {
    const s = src("app/(dashboard)/clients/[id]/ClientDetail.tsx");
    expect(s.indexOf("{report &&")).toBeGreaterThan(s.indexOf('role="tablist"'));
    expect(s.indexOf("{report &&")).toBeGreaterThan(s.indexOf('shown === "plan"'));
  });
});
