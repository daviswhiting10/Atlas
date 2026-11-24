import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("a dropped connection is said out loud, not swallowed", () => {
  it("the plan editor guards every save (athlete's Plan and the coach's plan editor are the same view)", () => {
    const s = src("components/athlete/PlanView.tsx");
    expect(s).toContain("guardActions(rest, () => router.refresh())");
    // setSkipped returns nothing and has its own try/catch: it must not be wrapped (a wrapped failure would read as success).
    expect(s).toMatch(/\{ \.\.\.guardActions\(rest[^)]*\)[^}]*, setSkipped \}/);
  });
  it("assigning and discarding a draft plan are guarded, and re-read the plan when the connection returns", () => {
    const s = src("components/coach/AssignPanel.tsx");
    expect(s).toMatch(/guard\(\(\) => assignDraftPlan\(.*router\.refresh\(\)\)/);
    expect(s).toMatch(/guard\(\(\) => discardDraftPlan\(.*router\.refresh\(\)\)/);
  });
  it("Add client keeps the form, says no connection, and looks for the first try's copy before adding again", () => {
    const s = src("app/(dashboard)/clients/page.tsx");
    expect(s).toContain("createdSince(list, form, firstTry.current)");
    expect(s).toContain("toast.error(NO_CONNECTION)");
    expect(s.indexOf("createdSince(")).toBeLessThan(s.indexOf('fetch("/api/clients", {\n          method: "POST"'));
  });
  it("Invite says no connection instead of failing silently", () => {
    const s = src("app/(dashboard)/clients/[id]/ClientDetail.tsx");
    expect(s).toMatch(/await fetch\(`\/api\/clients\/\$\{id\}\/invite`[\s\S]{0,200}catch \{[\s\S]{0,200}NO_CONNECTION/);
  });
  it("the coach's Finish with no connection says the sets are safe and to tap again", () => {
    const s = src("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
    expect(s).toContain("Your sets are saved on this phone. Tap Finish when you're back.");
  });
});

describe("a tick replayed from another device's blind spot (second device)", () => {
  for (const [name, path, flag] of [
    ["athlete", "components/athlete/WorkoutLogger.tsx", "replay.current.add(key)"],
    ["coach", "app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx", "replay.current.add(uid)"],
  ] as const) {
    it(`${name} logger: a failed-for-want-of-connection save is marked as a replay, and a conflict shows the server's version`, () => {
      const s = src(path);
      expect(s).toContain(flag);
      expect(s).toContain("expectDone:");
      expect(s).toMatch(/\.conflict/);
      expect(s).toContain("conflictMessage(");
    });
  }
  it("both server actions refuse to overwrite on a replay that disagrees, and a normal save never sends expectDone", () => {
    for (const p of ["lib/actions/athlete.ts", "lib/actions/workout-logger.ts"]) {
      const s = src(p);
      expect(s).toContain("replayConflict(input.expectDone");
      expect(s).toContain("input.expectDone !== undefined");
    }
  });
});
