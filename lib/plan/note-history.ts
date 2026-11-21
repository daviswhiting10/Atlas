/**
 * Notes from past sessions of the same workout in a plan ("Upper A" in weeks 1, 2, 3…), newest first, for the history
 * under a workout on the Plan tab. Pure.
 */
export type SessionNote = { week: number; date: string; text: string };

type W = { id: string; name: string; week: number; sessionNote?: { date: string; text: string } | null };

export const NOTE_HISTORY_MAX = 5;

/** Each workout's past session notes: sessions of a workout with the same name, in this week or before, with a note. */
export function noteHistory(workouts: W[], max = NOTE_HISTORY_MAX): Map<string, SessionNote[]> {
  const key = (n: string) => n.trim().toLowerCase();
  const out = new Map<string, SessionNote[]>();
  for (const w of workouts) {
    const past = workouts
      .filter((o) => key(o.name) === key(w.name) && o.week <= w.week && o.sessionNote?.text.trim())
      .map((o) => ({ week: o.week, date: o.sessionNote!.date, text: o.sessionNote!.text.trim() }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, max);
    out.set(w.id, past);
  }
  return out;
}
