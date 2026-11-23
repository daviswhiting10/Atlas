/**
 * Which lift Progress opens on. The headline is one lift's story ("+37% bench, 20 weeks", its curve, its lighter weeks marked),
 * not an average across everything: the lift the athlete has done most. "All lifts" is one tap away in the chooser.
 *
 * A lift needs enough sessions to draw a line through (the same bar as the chart: `minSessions`). Ties go to the
 * first listed, so the choice never flickers between loads. With no such lift, it is null and
 * Progress opens on the all-lifts line as before. Pure: no I/O.
 */
import type { SessionPoint } from "@/lib/plan/overload";

export function defaultLift(exercises: Array<{ exerciseId: string; series: SessionPoint[]; count?: number }>, minSessions = 3): string | null {
  let best: { id: string; n: number } | null = null;
  for (const e of exercises) {
    const n = e.count ?? e.series.length;
    if (n < minSessions) continue;
    if (!best || n > best.n) best = { id: e.exerciseId, n };
  }
  return best?.id ?? null;
}
