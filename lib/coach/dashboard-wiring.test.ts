import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("the Dashboard is the coach's landing, and Roster stays a tab", () => {
  it("each side's home, the sign-in redirect and the nav", () => {
    expect(read("lib/mode.ts")).toContain('coach: "/dashboard"');
    expect(read("lib/auth/route-policy.ts")).toContain('isAthlete ? "/today" : "/dashboard"');
    const nav = read("components/coach/CoachNav.tsx");
    expect(nav.indexOf('href: "/dashboard"')).toBeLessThan(nav.indexOf('href: "/log"'));
    expect(nav).toContain('href: "/clients", label: "Roster"');
  });
  it("one card per client, a link to their page; the filters are All, Overdue, Today", () => {
    const v = read("app/(dashboard)/dashboard/DashboardView.tsx");
    expect(v).toContain("href={`/clients/${r.id}`}");
    for (const f of ['chip("all"', 'chip("overdue"', 'chip("today"']) expect(v).toContain(f);
    expect(v).toContain("sm:grid-cols-2 lg:grid-cols-3");
  });
  it("the data is read for the coach's own workspace", () => {
    expect(read("lib/coach/dashboard-data.ts")).toContain("where: { workspaceId,");
    expect(read("app/(dashboard)/dashboard/page.tsx")).toContain("session?.user?.workspaceId");
  });
});
