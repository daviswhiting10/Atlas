import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("Today is focused: the challenge, the workout, one line of progress, and a Log button", () => {
  const today = read("components/athlete/TodayScreen.tsx");
  it("the name and the Log button, then the challenge chip, then one line, then the workout card", () => {
    const g = today.indexOf("{athlete.firstName}");
    const l = today.indexOf("{log}");
    const c = today.indexOf("{goal}");
    const line = today.indexOf('data-testid="plan-line"');
    const w = today.indexOf("Week {next.week}");
    expect([g, l, c, line, w].every((i) => i > -1)).toBe(true);
    expect(g).toBeLessThan(l);
    expect(l).toBeLessThan(c);
    expect(c).toBeLessThan(line);
    expect(line).toBeLessThan(w);
  });
  it("the one line reads 'Week 1 of 4 · 3/4 this week'", () => {
    expect(today).toContain("Week {plan.currentWeek} of {plan.totalWeeks}");
    expect(today).toContain("` · ${done}/${week.length} this week`");
  });
  it("no strength curve and no heatmap on Today: they are on Progress", () => {
    expect(today).not.toContain("{progress}");
    expect(read("app/(client)/today/page.tsx")).not.toContain("HomeProgress");
    expect(read("components/demo/DemoToday.tsx")).not.toContain("HomeProgressView");
    expect(read("components/athlete/ProgressScreen.tsx")).toContain("<ProgressView");
  });
  it("there is one h1 (the name); the workout name is an h2", () => {
    expect((today.match(/<h1/g) ?? []).length).toBe(1);
    expect(today).toContain("{next.name}</h2>");
  });
  it("the Log button is on real Today, with the running challenge; the demo has none", () => {
    expect(read("app/(client)/today/page.tsx")).toContain("<LogPill challengeId={goalId} />");
    expect(read("components/demo/DemoToday.tsx")).not.toContain("LogPill");
  });
});

describe("the Log button's sheet", () => {
  const pill = read("components/athlete/LogPill.tsx");
  it("Continue workout only when one was started; today's challenge only while one runs; then Walk, Run, Swim, Other cardio", () => {
    expect(pill).toContain("{inProgress && (");
    expect(pill).toContain("{challengeId && (");
    for (const l of ['"WALK", "Walk"', '"RUN", "Run"', '"SWIM", "Swim"', '"OTHER", "Other cardio"']) expect(pill).toContain(l);
  });
  it("whether there is a session to continue is looked up when it opens, not trusted from the page", () => {
    expect(pill).toContain("logOptions()");
  });
  it("a swim is other cardio, named Swim", () => {
    expect(read("components/athlete/QuickCardioSheet.tsx")).toContain('{ id: "SWIM", activity: "OTHER", label: "Swim" }');
    expect(read("lib/actions/athlete.ts")).toContain("title: label ??");
  });
});
