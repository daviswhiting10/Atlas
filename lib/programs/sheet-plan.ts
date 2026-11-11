/**
 * A coach's plan spreadsheet, read the way coaches fill them in:
 *
 *              Week 1            Week 2            …
 *   Exercise   Sets/reps  Load   Sets/reps  Load
 *   Goblet sq  2x12       12.5   2x12       15
 *
 * The model only transcribes the grid (names, notes, and each week's two
 * cells as written). Everything else happens here, by rule:
 *  - "2x12", "2x12-15", "1x10", "5 min", "3x20 seconds", "4x20 yd" → sets and reps/time
 *  - "12.5" → weight, "BW" → bodyweight, "blue" → band, anything else → a note
 *  - a day-week with a recorded load (a weight, a band, or a note) was done: it
 *    becomes a logged session. "BW" alone doesn't count: coaches write it
 *    ahead of time as part of the prescription.
 *  - each week keeps its own prescription, so week-to-week progression survives
 *
 * Pure: no I/O.
 */

export type GridWeek = { week: number; setsReps?: string; load?: string };
export type GridExercise = { name: string; notes?: string; weeks: GridWeek[] };
export type GridDay = { name: string; exercises: GridExercise[] };
export type SheetGrid = { programName?: string; days: GridDay[] };

export type Rx = { sets: number; repMin: number; repMax: number; unit: "reps" | "secs"; note: string | null };
export type Load = { weight: number | null; band: string | null; note: string | null };

/** The model's JSON, without fences, kept only if it has exercises in it. */
export function readGrid(raw: string): SheetGrid | null {
  try {
    const g = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()) as SheetGrid;
    if (!Array.isArray(g?.days)) return null;
    const days = g.days
      .filter((d) => d && Array.isArray(d.exercises))
      .map((d) => ({
        name: String(d.name ?? "").trim().slice(0, 120),
        exercises: d.exercises
          .filter((e) => e && typeof e.name === "string" && e.name.trim() && Array.isArray(e.weeks))
          .map((e) => ({
            name: e.name.trim().slice(0, 120),
            notes: typeof e.notes === "string" ? e.notes.trim().slice(0, 500) : undefined,
            weeks: e.weeks
              .filter((w) => w && Number.isInteger(w.week) && w.week >= 1 && w.week <= 52)
              .map((w) => ({ week: w.week, setsReps: String(w.setsReps ?? "").trim(), load: String(w.load ?? "").trim() })),
          })),
      }))
      .filter((d) => d.exercises.length > 0);
    return days.length > 0 ? { programName: typeof g.programName === "string" ? g.programName : undefined, days } : null;
  } catch {
    return null;
  }
}

const n = (s: string | undefined) => (s == null ? NaN : Number(s));

/** "2x12-15" / "1 x 10" / "5 min" / "3x20 seconds" / "4x20 yd" / "12 each" → a prescription. */
export function parseSetsReps(raw: string | undefined): Rx | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/[×*]/g, "x").replace(/\s+/g, " ");
  if (!s) return null;
  const m = s.match(/^(?:(\d{1,2})\s*x\s*)?(\d{1,4})(?:\s*(?:-|–|to)\s*(\d{1,4}))?\s*([a-z]+(?:\s+[a-z]+)?)?/);
  if (!m) return null;
  const sets = m[1] ? n(m[1]) : 1;
  let lo = n(m[2]);
  let hi = m[3] ? n(m[3]) : lo;
  const word = (m[4] ?? "").trim();
  let unit: Rx["unit"] = "reps";
  let note: string | null = null;
  if (/^(min|mins|minute|minutes)\b/.test(word)) {
    unit = "secs";
    lo *= 60;
    hi *= 60;
  } else if (/^(s|sec|secs|second|seconds)\b/.test(word)) {
    unit = "secs";
  } else if (word) {
    // yards, meters, "each", "per side"…: kept as written, counted as reps.
    note = word;
  }
  if (!(sets >= 1 && lo >= 1)) return null;
  return { sets: Math.min(sets, 12), repMin: Math.min(lo, 3600), repMax: Math.min(Math.max(hi, lo), 3600), unit, note };
}

const BAND = /\b(yellow|red|green|blue|black|purple|orange|gr[ae]y|silver|gold|pink|light band|medium band|heavy band)\b/i;

/** What was written in a Load cell. Empty → null (not done that week). */
export function parseLoad(raw: string | undefined): Load | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const num = s.match(/^~?\s*(\d{1,4}(?:\.\d{1,2})?)\s*(?:lbs?|#)?\s*\??$/i);
  if (num) return { weight: Number(num[1]), band: null, note: s.includes("?") ? s : null };
  if (/^(bw|body\s*weight|bodyweight)$/i.test(s)) return { weight: null, band: null, note: null };
  const band = s.match(BAND);
  if (band && s.length <= 20) return { weight: null, band: band[1].toLowerCase().replace("grey", "gray"), note: null };
  return { weight: null, band: null, note: s.slice(0, 300) };
}

/** Evenly spread training days through the week: 3 days → Mon, Wed, Fri. */
export function spreadDays(count: number): number[] {
  const table: Record<number, number[]> = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 7] };
  return table[Math.min(Math.max(count, 1), 7)];
}

export type PlannedEntry = { exercise: string; notes: string | null; rx: Rx; load: Load | null };
export type PlanWeek = { week: number; days: Array<{ name: string; dayOfWeek: number; entries: PlannedEntry[]; logged: boolean }> };

/** A load that records a session, as opposed to "BW" written ahead of time. */
export const recordsSession = (l: Load | null) => l != null && (l.weight != null || l.band != null || l.note != null);

/**
 * The plan, week by week. A day-week is logged when any of its Load cells
 * records a session; its other exercises count as done too (the coach just
 * didn't need a load for them).
 */
export function planFromGrid(grid: SheetGrid): { weeks: PlanWeek[]; lastLoggedWeek: number } {
  const totalWeeks = Math.max(1, ...grid.days.flatMap((d) => d.exercises.flatMap((e) => e.weeks.filter((w) => parseSetsReps(w.setsReps) || w.load).map((w) => w.week))));
  const days = spreadDays(grid.days.length);
  const weeks: PlanWeek[] = [];
  let lastLoggedWeek = 0;
  // An exercise's latest prescription, for weeks where only the load is filled in.
  const lastRx = new Map<string, Rx>();
  for (let week = 1; week <= totalWeeks; week++) {
    const planDays = grid.days.slice(0, 7).map((d, i) => {
      const entries: PlannedEntry[] = d.exercises.flatMap((e, j) => {
        const cell = e.weeks.find((w) => w.week === week);
        const key = `${i}:${j}`;
        // A load recorded with no sets/reps: done at the previous week's prescription.
        const rx = parseSetsReps(cell?.setsReps) ?? (recordsSession(parseLoad(cell?.load)) ? lastRx.get(key) ?? null : null);
        if (!rx) return [];
        lastRx.set(key, rx);
        return [{ exercise: e.name, notes: [e.notes, rx.note].filter(Boolean).join(" · ") || null, rx, load: parseLoad(cell?.load) }];
      });
      const logged = entries.some((x) => recordsSession(x.load));
      if (logged) lastLoggedWeek = Math.max(lastLoggedWeek, week);
      return { name: d.name || `Day ${i + 1}`, dayOfWeek: days[i], entries, logged };
    });
    weeks.push({ week, days: planDays.filter((d) => d.entries.length > 0) });
  }
  return { weeks, lastLoggedWeek };
}

/** Week 1's start when the coach doesn't say: far enough back that the first unfilled week is this week. */
export function inferWeekOneStart(lastLoggedWeek: number, today: Date): Date {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setDate(monday.getDate() - lastLoggedWeek * 7);
  return monday;
}
