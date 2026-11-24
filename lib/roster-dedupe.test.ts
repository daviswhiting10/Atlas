import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** One tap target per client row on both client lists (declutter audit). */
describe("client lists: one target per row", () => {
  it("the Log tab has one link per row, and it opens the logger", () => {
    const src = read("app/(dashboard)/log/LogClientList.tsx");
    expect((src.match(/<Link\b/g) ?? []).length).toBe(2); // the row, and the empty state's "Go to roster"
    expect(src).toContain("/clients/${r.id}/log");
  });
  it("the Roster has no second 'Log' link per row; the profile has the Log button", () => {
    expect(read("app/(dashboard)/clients/page.tsx")).not.toContain("Log a session for");
    expect(read("app/(dashboard)/clients/[id]/ClientDetail.tsx")).toContain("/log`");
  });
});
