/**
 * What the coach's Session complete screen says beyond the totals: how the session compares with the last time this workout
 * was done, and which lifts set a new best. Pure: the loader (lib/actions/workout-logger sessionWrapUp) does the reading.
 * Anything that can't be worked out (a first time, no earlier session, no plan) is left null, and the screen leaves that
 * part out rather than showing a zero.
 */

export type WrapSet = { exerciseId: string; name: string; weight: number | null; reps: number | null };

/** Weight × reps over the sets that have both (bodyweight, band and timed sets add nothing). */
export function volumeOf(sets: WrapSet[]): number {
  return sets.reduce((n, s) => n + (s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0 ? s.weight * s.reps : 0), 0);
}

export type Compare = {
  /** Change in volume since the last time, whole percent; null when either side has no volume to compare. */
  volumePct: number | null;
  /** Sets done this time and last time. */
  done: number;
  lastDone: number;
  /** Planned sets not done (null when the plan's count is unknown). */
  skipped: number | null;
};

/** `prev` null: this workout hasn't been done before, so there is nothing to compare with. */
export function compareWithLast(cur: WrapSet[], prev: WrapSet[] | null, planned: number | null): Compare | null {
  if (prev == null || prev.length === 0) return null;
  const a = volumeOf(cur);
  const b = volumeOf(prev);
  return {
    volumePct: a > 0 && b > 0 ? Math.round(((a - b) / b) * 100) : null,
    done: cur.length,
    lastDone: prev.length,
    skipped: planned == null ? null : Math.max(0, planned - cur.length),
  };
}

export type Medal = { name: string; weight: number; delta: number };

/**
 * Lifts whose best weight this session beat the best before it. A lift never done before has no earlier best, so it is not
 * a record (the first time is just the first time). `before`: the heaviest weight earlier, by exercise id.
 */
export function medalsOf(cur: WrapSet[], before: ReadonlyMap<string, number>): Medal[] {
  const best = new Map<string, { name: string; weight: number }>();
  for (const s of cur) {
    if (s.weight == null || s.weight <= 0) continue;
    const b = best.get(s.exerciseId);
    if (!b || s.weight > b.weight) best.set(s.exerciseId, { name: s.name, weight: s.weight });
  }
  const out: Medal[] = [];
  for (const [id, b] of Array.from(best)) {
    const prior = before.get(id);
    if (prior != null && b.weight > prior) out.push({ name: b.name, weight: b.weight, delta: b.weight - prior });
  }
  return out.sort((x, y) => y.delta - x.delta);
}

export type Next = { name: string; day: string } | null;

/** The wrap-up the screen shows. */
export type WrapUp = { compare: Compare | null; medals: Medal[]; next: Next; athleteNote: string | null };
