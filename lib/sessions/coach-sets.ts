/** The most sets one exercise shows: the athlete logger's cap (MAX_SETS in lib/athlete/data.ts). */
export const MAX_SETS = 20;

/** How many set rows an exercise opens with: the plan's count, or more when sets were logged past it (as the athlete's logger does). */
export function setCount(prescribed: number, logged: Array<{ setNumber: number }>): number {
  return Math.min(MAX_SETS, Math.max(prescribed, logged.reduce((m, s) => Math.max(m, s.setNumber), 0)));
}

/** The prescription for row i: its own, or, past the plan, a copy of the last one with this set's number. */
export function rxAt<T extends { setNumber: number }>(prescribed: T[], i: number, fallback: Omit<T, "setNumber">): T {
  return prescribed[i] ?? ({ ...(prescribed[prescribed.length - 1] ?? fallback), setNumber: i + 1 } as T);
}

/** What a save of a set sends, as one comparable string (the fields logSet gets), so a field left unchanged sends nothing. */
export function setValues(x: { weight: string; isBodyweight: boolean; isBand: boolean; bandColor: string; reps: string; rpe: string; note: string; completed: boolean }): string {
  const weight = x.isBodyweight || x.isBand ? null : x.weight ? parseFloat(x.weight) : null;
  return JSON.stringify([weight, x.isBand ? x.bandColor : null, x.reps ? parseInt(x.reps, 10) : null, x.rpe ? parseFloat(x.rpe) : null, x.note.trim() || null, x.completed]);
}
