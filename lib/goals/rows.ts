/**
 * The workout rows on the goal card: a slot for each workout the day needs, filled by the day's
 * finished workouts, plus any that are still being saved. Pure: no I/O.
 *
 * A row is one of:
 * - empty: tap it to log "Workout, 45 min" in the background;
 * - a workout: its minutes can be edited inline and it can be marked (outdoors).
 *
 * What the screen shows is the server's workouts for the day, changed by what the person has just done and the
 * server hasn't confirmed yet: workouts being saved (`pending`), ones just removed (`removed`), and edited
 * minutes (`minutesOver`).
 */

import { z } from "zod";
import type { TodayView } from "./today";

/** Whole minutes, 1 to 600: the same limit as a logged session. */
export const WorkoutMinutes = z.number().int().min(1).max(600);

export type PendingWorkout = {
  /** Known before the save returns. */
  tempId: string;
  minutes: number;
  outdoors: boolean;
  /** The real session's id once the save has returned. */
  sessionId: string | null;
  /** Undo was tapped: the row is hidden, and the session is removed as soon as its id is known. */
  undone: boolean;
};

export type WorkoutRow =
  | { kind: "empty"; key: string }
  | { kind: "workout"; key: string; sessionId: string | null; title: string; minutes: number | null; tags: string[]; saving: boolean; /** No sets: nothing is lost if it is removed. */ timeOnly: boolean };

export type RowsInput = {
  need: number;
  sessions: TodayView["sessions"];
  /** The tag the rows can carry, e.g. "outdoors"; null when the goal has none. */
  mark: string | null;
  pending: PendingWorkout[];
  /** Session ids hidden because a Remove or an Undo is in flight. */
  removed: string[];
  /** Minutes just edited, by session id (or a pending workout's temp id). */
  minutesOver: Record<string, number>;
};

export function workoutRows({ need, sessions, mark, pending, removed, minutesOver }: RowsInput): WorkoutRow[] {
  const gone = new Set(removed);
  const known = new Set(sessions.map((s) => s.id));

  const real: WorkoutRow[] = sessions
    .filter((s) => !gone.has(s.id))
    .map((s) => ({ kind: "workout", key: s.id, sessionId: s.id, title: s.title, minutes: minutesOver[s.id] ?? s.minutes, tags: s.tags, saving: false, timeOnly: s.sets === 0 }));

  const saving: WorkoutRow[] = pending
    // Hidden by Undo; or already part of the server's list; or removed since.
    .filter((p) => !p.undone && !(p.sessionId && known.has(p.sessionId)) && !(p.sessionId && gone.has(p.sessionId)))
    .map((p) => ({
      kind: "workout",
      key: p.tempId,
      sessionId: p.sessionId,
      title: "Workout",
      minutes: minutesOver[p.sessionId ?? p.tempId] ?? p.minutes,
      tags: p.outdoors && mark ? [mark] : [],
      saving: p.sessionId == null,
      timeOnly: true,
    }));

  const filled = [...real, ...saving];
  const empty: WorkoutRow[] = Array.from({ length: Math.max(0, need - filled.length) }, (_, i) => ({ kind: "empty", key: `empty-${i}` }));
  return [...filled, ...empty];
}

/** Does a "sessions per day" rule hold for these rows? Counts workouts with a long enough time (and the tag, if the rule has one). */
export function rowsMeetRule(rule: { need: number; mark: string | null; minMinutes: number | null }, rows: WorkoutRow[], hasTag: (row: Extract<WorkoutRow, { kind: "workout" }>, mark: string) => boolean): boolean {
  const counted = rows.filter(
    (r): r is Extract<WorkoutRow, { kind: "workout" }> =>
      r.kind === "workout" && r.minutes != null && (rule.minMinutes == null || r.minutes >= rule.minMinutes) && (rule.mark == null || hasTag(r, rule.mark))
  );
  return counted.length >= rule.need;
}

/** Pending workouts the server's list now includes can be forgotten. */
export function settlePending(pending: PendingWorkout[], sessionIds: string[]): PendingWorkout[] {
  const known = new Set(sessionIds);
  return pending.filter((p) => !(p.sessionId && known.has(p.sessionId)));
}
