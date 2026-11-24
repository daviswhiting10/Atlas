import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Home opens on your progress", () => {
  const today = read("components/athlete/TodayScreen.tsx");
  it("the greeting (first name) and the progress slot come before the workout card", () => {
    const g = today.indexOf("{athlete.firstName}");
    const p = today.indexOf("{progress}");
    const w = today.indexOf("Week {next.week}");
    expect(g).toBeGreaterThan(-1);
    expect(g).toBeLessThan(p);
    expect(p).toBeLessThan(w);
  });
  it("there is one h1 (the greeting); the workout name is an h2", () => {
    expect((today.match(/<h1/g) ?? []).length).toBe(1);
    expect(today).toContain("{next.name}</h2>");
  });
  it("real Today streams the progress behind the greeting", () => {
    const page = read("app/(client)/today/page.tsx");
    expect(page).toContain("<Suspense fallback={null}><HomeProgress");
  });
  it("/demo shows the same section from the sample athlete", () => {
    const demo = read("app/demo/page.tsx");
    expect(demo).toContain("HomeProgressView");
    expect(demo).toContain("DEMO_PROGRESS");
  });
  it("Home leaves the records on Progress", () => {
    expect(read("components/athlete/HomeProgress.tsx")).toContain("records={false}");
  });
});
