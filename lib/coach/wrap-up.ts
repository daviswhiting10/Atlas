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

/** Under this share of the planned sets, a session is partial: it is not compared with the last one. */
export const PARTIAL_BELOW = 0.7;

export type Compare =
  | { kind: "partial"; done: number; planned: number }
  | {
      kind: "full";
      /** Change in volume since the last time, whole percent; null when either side has no volume to compare. */
      volumePct: number | null;
      /** Sets done this time and last time. */
      done: number;
      lastDone: number;
      /** Planned sets not done (null when the plan's count is unknown). */
      skipped: number | null;
    };

/**
 * A session that logged fewer than 70% of its planned sets says so ("Partial session · 3 of 22 sets") and is not compared:
 * a percentage against a full session would only be noise. A finished one is compared with the last time this workout was
 * done; with no earlier session (or no plan to judge it by) there is nothing to say.
 */
export function compareWithLast(cur: WrapSet[], prev: WrapSet[] | null, planned: number | null): Compare | null {
  if (planned != null && planned > 0 && cur.length < planned * PARTIAL_BELOW) return { kind: "partial", done: cur.length, planned };
  if (prev == null || prev.length === 0) return null;
  const a = volumeOf(cur);
  const b = volumeOf(prev);
  return {
    kind: "full",
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
