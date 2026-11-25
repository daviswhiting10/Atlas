/**
 * Dumbbells and kettlebells "per hand" (docs/dumbbell-units.md). The weight typed is one bell; `SetLog.implements` says how
 * many were held: 2 = per hand, 1 = one bell, null = not recorded (older sets, other equipment), counted as one.
 *
 * Only load-moved totals multiply by it (lib/sessions/volume.ts). Records, e1RM, charts and the next target stay per bell.
 *
 * Pure: no I/O.
 */

export type Bells = 1 | 2;
type Ex = { name: string; equipment?: string | null };

/** Dumbbell or kettlebell equipment, however it was written ("Dumbbell", "db", "kettlebells", "kb"). */
export function isBellExercise(ex: { equipment?: string | null }): boolean {
  return /^(dumbbells?|db|kettlebells?|kb)$/i.test((ex.equipment ?? "").trim());
}

/** Lifts done with one bell, by name: per hand starts off for them. The catalog's list, not data. */
const SINGLE_BELL = /goblet|swing|\b(single|one|1)[- ]?arm\b|turkish get[- ]?up|pullover/i;

/** Per hand on, except a known single-bell lift; null for anything that isn't a dumbbell or kettlebell. */
export function defaultImplements(ex: Ex): Bells | null {
  if (!isBellExercise(ex)) return null;
  return SINGLE_BELL.test(ex.name) ? 1 : 2;
}

const isBells = (n: unknown): n is Bells => n === 1 || n === 2;

/** What a new set starts at: the athlete's last choice for the exercise, else the catalog default. */
export function startImplements(ex: Ex, last: number | null | undefined): Bells | null {
  if (!isBellExercise(ex)) return null;
  return isBells(last) ? last : defaultImplements(ex);
}

/** The newest recorded choice among sets ordered oldest first; null (not recorded) is skipped. */
export function lastImplements(rows: Array<{ implements?: number | null }>): Bells | null {
  for (let i = rows.length - 1; i >= 0; i--) if (isBells(rows[i].implements)) return rows[i].implements as Bells;
  return null;
}

/**
 * What a save writes to `SetLog.implements`: the value sent, for a dumbbell or kettlebell exercise; the default when a new set
 * arrives without one (an older page); undefined (leave it) otherwise. Other equipment never gets one.
 */
export function implementsToStore(ex: Ex, sent: number | null | undefined, creating: boolean): Bells | undefined {
  if (!isBellExercise(ex)) return undefined;
  if (isBells(sent)) return sent;
  return creating ? (defaultImplements(ex) ?? undefined) : undefined;
}

/** How many bells a set counts for in load moved: null (not recorded) is one. */
export const bellCount = (n: number | null | undefined): number => (n === 2 ? 2 : 1);
