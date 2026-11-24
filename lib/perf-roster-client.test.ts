import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const has = (p: string) => existsSync(new URL(`../${p}`, import.meta.url));

/** Roster -> client page (docs/perf-audit.md, offender 5). */
describe("roster to client page", () => {
  it("a row doesn't prefetch on render (a request per client), nor a full prefetch Next would reuse for 5 minutes", () => {
    const src = read("app/(dashboard)/clients/page.tsx");
    const row = src.slice(src.indexOf("href={`/clients/${client.id}`}"), src.indexOf("draggable={false}", src.indexOf("href={`/clients/${client.id}`}")));
    expect(row).toContain("prefetch={false}");
    expect(src).not.toContain("router.prefetch(`/clients/${client.id}`");
  });
  it("the client page has a frame, and it covers that page only (not sessions, plans or the logger under it)", () => {
    expect(has("app/(dashboard)/clients/[id]/(overview)/loading.tsx")).toBe(true);
    expect(has("app/(dashboard)/clients/[id]/(overview)/page.tsx")).toBe(true);
    expect(has("app/(dashboard)/clients/[id]/loading.tsx")).toBe(false);
  });
});
