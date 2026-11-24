/**
 * Work units: one number for how much training a session (or a day) was, the same across kinds of work, so a lifting day, a
 * long run and an hour of walking can share one heatmap colour scale. Pure: no I/O.
 *
 *   strength sets × 1  +  (cardio + timed) minutes ÷ 3  +  walk minutes ÷ 10  +  mobility minutes ÷ 5
 *
 * Strength is counted in sets. Cardio, walking and mobility are counted in minutes: a quick log (a run or a walk with no
 * exercises behind it) is its whole duration; in a session of logged sets, the session's duration is shared out by how many
 * logged sets each kind has. A session with no duration written down counts its strength sets only.
 *
 * A timed set (a plank, a carry, a hold: its reps are seconds) counts by its own time only, never as a set: its seconds as
 * minutes, at the cardio rate (hard, continuous work, unlike a walk or a stretch). Three 45 s planks are 2.25 min = 0.75
 * units, where they used to be 3 sets. A timed set in the mobility group stays mobility.
 */
import { isLoggedSet } from "./days";
import type { HistorySession } from "./types";

export type Work = {
  /** Strength sets. */
  sets: number;
  /** Minutes of running and other cardio, of walking, of mobility, of timed holds and carries. */
  runMin: number;
  walkMin: number;
  mobMin: number;
  holdMin: number;
  /** The units, unrounded. */
  units: number;
};

export const RUN_PER_UNIT = 3;
export const WALK_PER_UNIT = 10;
export const MOBILITY_PER_UNIT = 5;

/** Timed holds and carries count at the cardio rate. */
export const HOLD_PER_UNIT = RUN_PER_UNIT;

export const NO_WORK: Work = { sets: 0, runMin: 0, walkMin: 0, mobMin: 0, holdMin: 0, units: 0 };

export function unitsOf(w: Pick<Work, "sets" | "runMin" | "walkMin" | "mobMin" | "holdMin">): number {
  return w.sets + w.runMin / RUN_PER_UNIT + w.walkMin / WALK_PER_UNIT + w.mobMin / MOBILITY_PER_UNIT + w.holdMin / HOLD_PER_UNIT;
}

export function workOf(s: HistorySession): Work {
  const logged = s.sets.filter(isLoggedSet);
  let sets = 0;
  let run = 0;
  let walk = 0;
  let mob = 0;
  let holdSec = 0;
  for (const x of logged) {
    if (x.mobility) mob++;
    else if (x.cardio === "WALK") walk++;
    else if (x.cardio) run++;
    else if (x.timed) holdSec += x.reps as number;
    else sets++;
  }
  const holdMin = holdSec / 60;
  const minutes = s.durationMin ?? 0;
  let runMin = 0;
  let walkMin = 0;
  let mobMin = 0;
  if (logged.length > 0) {
    const per = minutes / logged.length;
    runMin = run * per;
    walkMin = walk * per;
    mobMin = mob * per;
  }
  // A quick log: the whole duration is that one kind.
  if (s.activity) {
    if (s.activity === "WALK") walkMin += minutes;
    else runMin += minutes;
  }
  const w = { sets, runMin: Math.round(runMin), walkMin: Math.round(walkMin), mobMin: Math.round(mobMin), holdMin: Math.round(holdMin) };
  return { ...w, units: unitsOf({ sets, runMin, walkMin, mobMin, holdMin }) };
}

export function addWork(list: Work[]): Work {
  const t = list.reduce(
    (a, w) => ({ sets: a.sets + w.sets, runMin: a.runMin + w.runMin, walkMin: a.walkMin + w.walkMin, mobMin: a.mobMin + w.mobMin, holdMin: a.holdMin + w.holdMin, units: a.units + w.units }),
    { ...NO_WORK }
  );
  return t;
}
