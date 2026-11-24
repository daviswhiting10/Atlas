import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Client page -> coach logger (docs/perf-audit.md, offender 3). */
describe("coach logger entry", () => {
  it("the client page's Log session button is prefetched", () => {
    const src = read("app/(dashboard)/clients/[id]/ClientDetail.tsx");
    const i = src.indexOf('className="press mb-8 flex h-14');
    const link = src.slice(src.lastIndexOf("<Link", i), i);
    expect(link).toContain("href={`/clients/${client.id}/log`}");
    expect(link).toMatch(/\bprefetch\n/);
  });
});
