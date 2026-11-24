import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Plan -> Open workout -> logger (docs/perf-audit.md, offender 4). */
describe("athlete logger entry", () => {
  it("the day card's link is prefetched, Start or Open workout", () => {
    const src = read("components/athlete/PlanWeek.tsx");
    // The Start / View session link: the last link to the workout (a done day's mini summary links there first).
    const at = src.lastIndexOf("href={`${base}/workouts/${w.id}`}");
    const link = src.slice(at, src.indexOf("className=", at));
    expect(link).toMatch(/\bprefetch\n/);
    expect(link).not.toContain("prefetch={cell.upNext}");
  });
  it("the logger's data is two rounds after the athlete: workout with the lifts' history, then week, pictures and note", () => {
    const data = read("lib/athlete/data.ts");
    const fn = data.slice(data.indexOf("export async function getLoggerData"), data.indexOf("return {\n    id: workout.id,"));
    expect((fn.match(/await /g) ?? []).length).toBe(3); // getAthlete, round 1, round 2
    expect(fn).toContain("await Promise.all([workoutQuery, historyQuery])");
    expect(fn).toContain("const [siblings, own, notes] = await Promise.all([");
    // The history is scoped to this athlete whatever id is asked for.
    expect(fn).toContain("workoutLog: { clientId: athlete.clientId, NOT: { assignedWorkoutId } }");
  });
});
