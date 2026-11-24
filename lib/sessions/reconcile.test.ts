import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";

type S = { weight: number; done: boolean };
const same = (a: S[], b: S[]) => JSON.stringify(a) === JSON.stringify(b);
const opened = { bench: [{ weight: 100, done: false }], row: [{ weight: 80, done: false }] };

describe("a logger opening from an old copy of the page", () => {
  it("what hasn't been touched takes the fresh sets: the tick saved last time shows", () => {
    const fresh = { bench: [{ weight: 100, done: true }], row: [{ weight: 80, done: false }] };
    expect(reconcile(opened, opened, fresh, same)).toEqual(fresh);
  });
  it("what the person changed since opening is kept", () => {
    const current = { bench: [{ weight: 105, done: false }], row: [{ weight: 80, done: false }] };
    const fresh = { bench: [{ weight: 100, done: true }], row: [{ weight: 80, done: true }] };
    expect(reconcile(current, opened, fresh, same)).toEqual({ bench: [{ weight: 105, done: false }], row: [{ weight: 80, done: true }] });
  });
  it("an exercise only the fresh read has is added", () => {
    expect(reconcile(opened, opened, { ...opened, curl: [{ weight: 30, done: true }] }, same).curl).toEqual([{ weight: 30, done: true }]);
  });
  it("an exercise the fresh read doesn't have is left as it is", () => {
    expect(reconcile({ ...opened, extra: [{ weight: 1, done: false }] }, opened, opened, same).extra).toEqual([{ weight: 1, done: false }]);
  });
  it("the same data twice changes nothing", () => {
    expect(reconcile(opened, opened, opened, same)).toEqual(opened);
  });
});

import { readFileSync } from "node:fs";
describe("both loggers read the session again when they open", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  it("athlete logger: freshSets on mount, merged by reconcile; the demo has none", () => {
    const a = read("components/athlete/WorkoutLogger.tsx");
    expect(a).toContain("freshSets({ assignedWorkoutId: data.id })");
    expect(a).toContain("reconcile(setsRef.current, openedSets.current");
    expect(read("lib/demo/actions.ts")).not.toContain("freshSets");
  });
  it("coach logger: freshSessionSets on mount, and it adopts a session the page didn't know about", () => {
    const c = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
    expect(c).toContain("freshSessionSets({ assignedWorkoutId })");
    expect(c).toContain("reconcile(cur, openedState.current");
    expect(c).toContain("setWorkoutLogId(log.id)");
  });
  it("both reads are for the signed-in person only", () => {
    expect(read("lib/actions/athlete.ts")).toMatch(/export async function freshLoggerSets[\s\S]*?await requireAthlete\(\)/);
    expect(read("lib/actions/workout-logger.ts")).toMatch(/export async function freshSessionSets[\s\S]*?requireWorkspace\(\)[\s\S]*?client: \{ workspaceId \}/);
  });
});
