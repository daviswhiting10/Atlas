import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const s = readFileSync(new URL("../app/(dashboard)/clients/page.tsx", import.meta.url), "utf8");

describe("Roster (Clients): fewer controls above the list", () => {
  it("Import is inside the Add Client dialog, not its own button beside it", () => {
    const dialogStart = s.indexOf("<DialogContent>");
    const dialogEnd = s.indexOf("</DialogContent>");
    const importAt = s.indexOf('href="/clients/import"');
    expect(importAt).toBeGreaterThan(dialogStart);
    expect(importAt).toBeLessThan(dialogEnd);
  });
  it("Search appears only with more than 8 clients, and a hidden box never filters", () => {
    expect(s).toContain("const SEARCH_FROM = 8;");
    expect(s).toContain("const searching = clients.length > SEARCH_FROM;");
    expect(s).toContain("!searching ||");
    expect(s).toContain("{searching && <div");
  });
});
