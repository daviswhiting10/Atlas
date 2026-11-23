/**
 * A note pinned to one week of a plan ("Deload week next: same weights, half the sets"). Stored on the plan
 * (ProgramAssignment.weekNotes); Today shows the current week's, Plan shows the current one and the weeks to come.
 * Pure: no I/O, so the demo's fixed plan uses it too.
 */

export type WeekNote = { week: number; title?: string; text: string; by?: string };

export const MAX_WEEK_NOTE = 400;

/** The stored value, checked: one note per week (the last wins), weeks 1-52, text capped, in week order. */
export function readWeekNotes(raw: unknown): WeekNote[] {
  if (!Array.isArray(raw)) return [];
  const byWeek = new Map<number, WeekNote>();
  for (const n of raw) {
    if (!n || typeof n !== "object") continue;
    const o = n as Record<string, unknown>;
    const week = Number(o.week);
    const text = typeof o.text === "string" ? o.text.trim().slice(0, MAX_WEEK_NOTE) : "";
    if (!Number.isInteger(week) || week < 1 || week > 52 || !text) continue;
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 80) : undefined;
    const by = typeof o.by === "string" && o.by.trim() ? o.by.trim().slice(0, 60) : undefined;
    byWeek.set(week, { week, text, ...(title ? { title } : {}), ...(by ? { by } : {}) });
  }
  return Array.from(byWeek.values()).sort((a, b) => a.week - b.week);
}

/** This week's note, if there is one. */
export const noteForWeek = (notes: WeekNote[] | undefined, week: number): WeekNote | null => notes?.find((n) => n.week === week) ?? null;

/** The notes for the weeks after this one. */
export const comingNotes = (notes: WeekNote[] | undefined, week: number): WeekNote[] => (notes ?? []).filter((n) => n.week > week);

/** Set (or, with empty text, clear) one week's note. */
export function setWeekNote(notes: WeekNote[], week: number, text: string, extra: { title?: string; by?: string } = {}): WeekNote[] {
  const rest = notes.filter((n) => n.week !== week);
  return text.trim() ? readWeekNotes([...rest, { week, text, ...extra }]) : rest;
}
