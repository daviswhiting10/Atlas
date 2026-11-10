/**
 * Demo history — pure, deterministic, no I/O.
 *
 * Simulates what an athlete following the plan would have logged, so the demo
 * account opens with believable charts. Each lift follows the same double
 * progression the app coaches (reps up through the range, then weight up),
 * with the things real training has: stalled sessions, a couple of missed
 * workouts, fatigue across sets, and lighter weeks.
 */

import { CATALOG_BY_SLUG } from "./catalog";
import type { Prefs } from "./generator";

export type DemoWorkout = {
  id: string;
  scheduledDate: Date;
  deload: boolean;
  exercises: Array<{
    id: string;
    exerciseId: string;
    slug: string;
    role?: "main" | "secondary" | "accessory";
    sets: number;
    repMin: number;
    repMax: number;
    unit: "reps" | "secs";
  }>;
};

export type DemoLog = {
  workoutId: string;
  date: Date;
  durationMin: number;
  sets: Array<{
    aweId: string;
    exerciseId: string;
    setNumber: number;
    weight: number | null;
    reps: number;
    rpe: number;
    at: Date;
  }>;
};

/** Small deterministic PRNG so the demo looks the same every time. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVEL_SCALE = { beginner: 0.6, intermediate: 1, advanced: 1.3 } as const;
/** Which past sessions (by position) the demo athlete missed. */
const SKIPPED_SESSIONS = new Set([9, 22]);
/**
 * Chance a session brings no progress on a lift. Compound lifts move more
 * reliably than accessories. Tuned so an intermediate lifter adds weight to a
 * main lift about once in two months — personal records stay rare enough to
 * mean something (see demo.test.ts, which pins the range).
 */
const STALL = { main: 0.15, secondary: 0.3, accessory: 0.45 } as const;

type LiftState = { weight: number | null; reps: number; lastVolume: number | null };

export function simulateDemoHistory({
  prefs,
  workouts,
  until,
}: {
  prefs: Prefs;
  workouts: DemoWorkout[];
  /** Only workouts scheduled before this moment are logged. */
  until: Date;
}): { logs: DemoLog[]; skipped: string[] } {
  const rand = mulberry32(20260519);
  const state = new Map<string, LiftState>();
  const scale = LEVEL_SCALE[prefs.experience];
  const logs: DemoLog[] = [];
  const skipped: string[] = [];

  const past = workouts.filter((w) => w.scheduledDate.getTime() < until.getTime());

  past.forEach((w, n) => {
    if (SKIPPED_SESSIONS.has(n)) {
      skipped.push(w.id);
      return;
    }

    const date = new Date(w.scheduledDate.getTime() + (17 + Math.floor(rand() * 3)) * 3_600_000);
    const log: DemoLog = { workoutId: w.id, date, durationMin: 46 + Math.floor(rand() * 20), sets: [] };

    for (const e of w.exercises) {
      const cat = CATALOG_BY_SLUG[e.slug];
      const inc = cat?.inc ?? 0;
      const loaded = cat?.base != null && inc > 0;

      let s = state.get(e.slug);
      if (!s) {
        const start = loaded ? Math.max(inc, Math.round(((cat.base as number) * scale * 0.9) / inc) * inc) : null;
        s = { weight: start, reps: e.unit === "secs" ? 30 : e.repMin + 1, lastVolume: null };
        state.set(e.slug, s);
      }
      // Rep ranges can shift between blocks — keep the lift inside today's range.
      if (e.unit === "reps" && loaded) s.reps = Math.min(Math.max(s.reps, e.repMin), e.repMax);

      // Reps for each set: the top set, then a little fatigue on later ones.
      const top = w.deload ? Math.max(1, s.reps - (e.unit === "secs" ? 10 : 2)) : s.reps;
      const reps = Array.from({ length: e.sets }, (_, i) => {
        if (e.unit === "secs") return Math.max(10, top - i * 5);
        const fatigue = i === 0 ? 0 : i === 1 ? (rand() < 0.35 ? 1 : 0) : rand() < 0.7 ? 1 : 2;
        return Math.max(1, top - fatigue);
      });

      // No two sessions of a lift are ever identical: real logs never are.
      const volumeOf = () => reps.reduce((sum, r) => sum + (s!.weight ?? 1) * r, 0);
      if (s.lastVolume != null && volumeOf() === s.lastVolume) {
        const last = reps.length - 1;
        reps[last] = reps[last] > 1 ? reps[last] - 1 : reps[last] + 1;
      }
      s.lastVolume = volumeOf();

      reps.forEach((r, i) => {
        log.sets.push({
          aweId: e.id,
          exerciseId: e.exerciseId,
          setNumber: i + 1,
          weight: s!.weight,
          reps: r,
          rpe: Math.min(9.5, 7 + Math.round(rand() * 4) / 2),
          at: new Date(date.getTime() + i * 150_000),
        });
      });

      if (w.deload) continue; // a lighter week is not a step forward
      if (rand() < STALL[e.role ?? "accessory"]) continue;

      if (e.unit === "secs") s.reps = Math.min(s.reps + 5, 120);
      else if (!loaded) s.reps += 1;
      else if (s.reps >= e.repMax) {
        s.weight = (s.weight as number) + inc;
        s.reps = Math.max(e.repMin, e.repMax - 2);
      } else s.reps += 1;
    }

    logs.push(log);
  });

  return { logs, skipped };
}
