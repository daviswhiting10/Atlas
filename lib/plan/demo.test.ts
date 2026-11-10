import { describe, expect, it } from "vitest";
import { simulateDemoHistory, type DemoWorkout } from "./demo";
import { generatePlan, weekInfo, weekVariant, type Prefs } from "./generator";
import { buildSeries, sessionPoint } from "./overload";

const DEMO: Prefs = { goal: "muscle", experience: "intermediate", daysPerWeek: 4, equipment: "gym", minutes: 60 };
const DAY = 86_400_000;
const START = new Date("2026-09-08T00:00:00Z");
const WEEKS_OF_HISTORY = 9;

function workoutsFor(prefs: Prefs): DemoWorkout[] {
  const plan = generatePlan(prefs);
  const out: DemoWorkout[] = [];
  for (let week = 1; week <= 12; week++) {
    weekVariant(plan, week).forEach((day, d) => {
      out.push({
        id: `w${week}d${d}`,
        scheduledDate: new Date(START.getTime() + ((week - 1) * 7 + day.offset) * DAY),
        deload: weekInfo(plan, week).deload,
        exercises: day.exercises.map((e, i) => ({ id: `w${week}d${d}e${i}`, exerciseId: e.slug, slug: e.slug, role: e.role, sets: e.sets, repMin: e.repMin, repMax: e.repMax, unit: e.unit })),
      });
    });
  }
  return out;
}

function seriesByExercise(prefs: Prefs) {
  const workouts = workoutsFor(prefs);
  const deloadById = new Map(workouts.map((w) => [w.id, w.deload]));
  const { logs, skipped } = simulateDemoHistory({ prefs, workouts, until: new Date(START.getTime() + WEEKS_OF_HISTORY * 7 * DAY) });
  const byExercise = new Map<string, Array<NonNullable<ReturnType<typeof sessionPoint>>>>();
  for (const log of logs) {
    const sets = new Map<string, Array<{ weight: number | null; reps: number; completed: boolean }>>();
    for (const s of log.sets) {
      if (!sets.has(s.exerciseId)) sets.set(s.exerciseId, []);
      sets.get(s.exerciseId)!.push({ weight: s.weight, reps: s.reps, completed: true });
    }
    sets.forEach((list, exerciseId) => {
      const p = sessionPoint(log.date.toISOString().slice(0, 10), list, deloadById.get(log.workoutId));
      if (!p) return;
      if (!byExercise.has(exerciseId)) byExercise.set(exerciseId, []);
      byExercise.get(exerciseId)!.push(p);
    });
  }
  return { logs, skipped, series: new Map(Array.from(byExercise, ([k, v]) => [k, buildSeries(v)] as const)) };
}

describe("simulateDemoHistory", () => {
  const demo = seriesByExercise(DEMO);

  it("is deterministic", () => {
    expect(seriesByExercise(DEMO).logs).toEqual(demo.logs);
  });

  it("logs nine weeks, missing a couple of sessions", () => {
    expect(demo.skipped).toHaveLength(2);
    expect(demo.logs).toHaveLength(WEEKS_OF_HISTORY * DEMO.daysPerWeek - 2);
  });

  it("keeps personal records rare: 8 to 12 across the whole block", () => {
    const records = Array.from(demo.series.values()).flat().filter((p) => p.record).length;
    expect(records).toBeGreaterThanOrEqual(8);
    expect(records).toBeLessThanOrEqual(12);
  });

  it("never logs the same session volume twice in a row for a lift", () => {
    demo.series.forEach((series, exercise) => {
      for (let i = 1; i < series.length; i++) {
        expect(series[i].volume, `${exercise} on ${series[i].date}`).not.toBe(series[i - 1].volume);
      }
    });
  });

  it("dips on lighter weeks and marks them", () => {
    const bench = demo.series.get("barbell-bench-press-medium-grip")!;
    const lighter = bench.filter((p) => p.deload);
    expect(lighter.length).toBeGreaterThanOrEqual(2);
    for (const p of lighter) {
      const before = bench[bench.indexOf(p) - 1];
      expect(p.volume).toBeLessThan(before.volume);
      expect(p.record).toBe(false);
    }
  });

  it("still moves forward: main lifts end heavier or for more reps than they started", () => {
    for (const slug of ["barbell-bench-press-medium-grip", "barbell-squat", "barbell-deadlift"]) {
      const s = demo.series.get(slug)!;
      const first = s[0];
      const last = s.filter((p) => !p.deload).at(-1)!;
      expect((last.e1rm ?? 0) > (first.e1rm ?? 0), slug).toBe(true);
    }
  });

  it.each(["strength", "fat_loss", "general"] as const)("holds up for a %s plan too", (goal) => {
    const other = seriesByExercise({ ...DEMO, goal });
    other.series.forEach((series) => {
      for (let i = 1; i < series.length; i++) expect(series[i].volume).not.toBe(series[i - 1].volume);
    });
  });
});
