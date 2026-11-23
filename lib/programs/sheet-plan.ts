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

import { sectionsFromSheet } from "@/lib/workouts/structure";

export type GridWeek = { week: number; setsReps?: string; load?: string };
export type GridExercise = {
  name: string;
  notes?: string;
  /** The sheet's group label ("A", "1A", "Warm-up"), carried down its group. */
  label?: string;
  /** Rest between sets, in seconds, when the file says. */
  rest?: number | null;
  weeks: GridWeek[];
};
export type GridDay = { name: string; exercises: GridExercise[] };
/**
 * `note`: the plan-level text in the file (an overview table, how-to notes), kept on the plan.
 * `uncertain`: what the reader had to guess, shown to the coach before saving.
 */
export type SheetGrid = { programName?: string; note?: string; uncertain?: string[]; days: GridDay[] };

export type Rx = { sets: number; repMin: number; repMax: number; unit: "reps" | "secs"; note: string | null; /** The time unit was guessed (minutes); the preview asks. */ unclear?: boolean };
export type Load = { weight: number | null; band: string | null; note: string | null };

/** The model's JSON, without fences, kept only if it has exercises in it. */
export function readGrid(raw: string): SheetGrid | null {
  try {
    const g = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()) as SheetGrid;
    if (!Array.isArray(g?.days)) return null;
    // Capped: the save step takes the grid back from the browser.
    const days = g.days
      .slice(0, 14)
      .filter((d) => d && Array.isArray(d.exercises))
      .map((d) => ({
        name: String(d.name ?? "").trim().slice(0, 120),
        exercises: d.exercises
          .slice(0, 60)
          .filter((e) => e && typeof e.name === "string" && e.name.trim() && Array.isArray(e.weeks))
          .map((e) => ({
            name: e.name.trim().slice(0, 120),
            notes: typeof e.notes === "string" ? e.notes.trim().slice(0, 500) : undefined,
            label: typeof e.label === "string" && e.label.trim() ? e.label.trim().slice(0, 40) : undefined,
            rest: Number.isInteger(e.rest) && (e.rest as number) >= 0 && (e.rest as number) <= 900 ? (e.rest as number) : null,
            weeks: e.weeks
              .slice(0, 52)
              .filter((w) => w && Number.isInteger(w.week) && w.week >= 1 && w.week <= 52)
              .map((w) => ({ week: w.week, setsReps: String(w.setsReps ?? "").trim().slice(0, 120), load: String(w.load ?? "").trim().slice(0, 300) })),
          })),
      }))
      .filter((d) => d.exercises.length > 0);
    const note = typeof g.note === "string" && g.note.trim() ? g.note.trim().slice(0, 2000) : undefined;
    const uncertain = Array.isArray(g.uncertain) ? g.uncertain.filter((u): u is string => typeof u === "string" && !!u.trim()).map((u) => u.trim().slice(0, 200)).slice(0, 30) : [];
    return days.length > 0
      ? { programName: typeof g.programName === "string" ? g.programName.slice(0, 120) : undefined, ...(note ? { note } : {}), ...(uncertain.length ? { uncertain } : {}), days }
      : null;
  } catch {
    return null;
  }
}

const n = (s: string | undefined) => (s == null ? NaN : Number(s));

/** Exercises done for time, where a bare "15" means minutes, not 15 reps. */
const TIMED = /\b(bike|cycl\w*|run|jog|walk\w*|row(?:er|ing)?|erg|treadmill|elliptical|stair\w*|swim\w*|zone ?[1-5]|z[1-5]|cardio|conditioning|ski ?erg|assault|airdyne|echo bike|hike|sled push|incline walk)\b/i;
/** "min", "mins", "minute(s)", "m", or a foot mark (15' / 15’) after the number. */
const MINUTES = /^(?:min|mins|minute|minutes|m|'|’)(?![a-z])/;
const SECONDS = /^(?:s|sec|secs|second|seconds|"|”|″)(?![a-z])/;

/**
 * "2x12-15" / "1 x 10" / "5 min" / "15'" / "3x20 seconds" / "4x20 yd" / "12 each" → a prescription.
 * Time is always stored in seconds ("15 min" → 900, never 15). `name` lets a bare number on a
 * timed exercise ("Bike", "Zone 2") read as minutes; that guess, and "15m" (minutes or metres?),
 * come back with `unclear` so the preview can ask.
 */
export function parseSetsReps(raw: string | undefined, name = ""): Rx | null {
  let s = (raw ?? "").trim().toLowerCase().replace(/[×*]/g, "x").replace(/\s+/g, " ");
  if (!s) return null;
  // "Zone 2, 15 min": the duration is later in the cell. Take it, keep the rest as a note.
  let lead: string | null = null;
  if (!/^\d/.test(s)) {
    const t = s.match(/(\d{1,3}(?:\s*(?:-|–|to)\s*\d{1,3})?)\s*(min|mins|minutes?|'|’)(?![a-z])/);
    if (!t) return null;
    lead = s.slice(0, t.index).replace(/[,;:·\s-]+$/, "").trim() || null;
    s = s.slice(t.index);
  }
  const m = s.match(/^(?:(\d{1,2})\s*x\s*)?(\d{1,4})(?:\s*(?:-|–|to)\s*(\d{1,4}))?\s*((?:[a-z]+|['’"”″])(?:\s+[a-z]+)?)?/);
  if (!m) return null;
  const sets = m[1] ? n(m[1]) : 1;
  let lo = n(m[2]);
  let hi = m[3] ? n(m[3]) : lo;
  const word = (m[4] ?? "").trim();
  let unit: Rx["unit"] = "reps";
  let note: string | null = null;
  let unclear = false;
  const minutes = () => {
    unit = "secs";
    lo *= 60;
    hi *= 60;
  };
  if (MINUTES.test(word)) {
    minutes();
    unclear = word === "m"; // minutes, or metres
  } else if (SECONDS.test(word)) {
    unit = "secs";
  } else if (!word && !m[1] && TIMED.test(name)) {
    minutes();
    unclear = true; // no unit written
  } else if (word) {
    // yards, meters, "each", "per side"…: kept as written, counted as reps.
    note = word;
  }
  if (lead) note = [lead, note].filter(Boolean).join(" · ");
  if (!(sets >= 1 && lo >= 1)) return null;
  const rx: Rx = { sets: Math.min(sets, 12), repMin: Math.min(lo, 3600), repMax: Math.min(Math.max(hi, lo), 3600), unit, note };
  return unclear ? { ...rx, unclear } : rx;
}

/** "900" seconds → "15 min"; "45" → "45 s". */
export function formatTime(secs: number): string {
  return secs >= 60 && secs % 60 === 0 ? `${secs / 60} min` : secs > 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;
}

/** Every timed exercise in the grid, once each, with its time as first written (for the preview). */
export type TimedRow = { day: number; exercise: number; name: string; time: string; unclear: boolean };
export function timedRows(grid: SheetGrid): TimedRow[] {
  const out: TimedRow[] = [];
  grid.days.forEach((d, di) =>
    d.exercises.forEach((e, ei) => {
      const rx = e.weeks.map((w) => parseSetsReps(w.setsReps, `${e.name} ${e.notes ?? ""}`)).find((r) => r?.unit === "secs");
      if (!rx) return;
      const t = rx.repMin === rx.repMax ? formatTime(rx.repMin) : `${formatTime(rx.repMin).replace(/ (min|s)$/, "")}–${formatTime(rx.repMax)}`;
      out.push({ day: di, exercise: ei, name: e.name, time: rx.sets > 1 ? `${rx.sets} × ${t}` : t, unclear: !!rx.unclear });
    }),
  );
  return out.slice(0, 20);
}

/** The preview's fix for an unclear time: rewrite that exercise's cells with the unit spelled out. */
export function setTimeUnit(grid: SheetGrid, day: number, exercise: number, unit: "min" | "s"): SheetGrid {
  return {
    ...grid,
    days: grid.days.map((d, di) =>
      di !== day
        ? d
        : {
            ...d,
            exercises: d.exercises.map((e, ei) =>
              ei !== exercise
                ? e
                : { ...e, weeks: e.weeks.map((w) => ({ ...w, setsReps: (w.setsReps ?? "").replace(/^((?:\d{1,2}\s*[x×*]\s*)?\d{1,4}(?:\s*(?:-|–|to)\s*\d{1,4})?)\s*(?:m|min|mins|minutes?|s|sec|secs|seconds?)?\b\s*$/i, `$1 ${unit}`) })) },
            ),
          },
    ),
  };
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

export type PlannedEntry = { exercise: string; notes: string | null; /** "warmup" | "block:<n>" | "cooldown" (lib/workouts/structure). */ section: string; rx: Rx; load: Load | null; rest?: number | null };
export type PlanWeek = { week: number; days: Array<{ name: string; dayOfWeek: number; entries: PlannedEntry[]; logged: boolean }> };

/** A load that records a session, as opposed to "BW" written ahead of time. */
export const recordsSession = (l: Load | null) => l != null && (l.weight != null || l.band != null || l.note != null);

/**
 * The plan, week by week. A day-week is logged when any of its Load cells
 * records a session; its other exercises count as done too (the coach just
 * didn't need a load for them).
 */
export function planFromGrid(grid: SheetGrid): { weeks: PlanWeek[]; lastLoggedWeek: number } {
  const totalWeeks = Math.max(1, ...grid.days.flatMap((d) => d.exercises.flatMap((e) => e.weeks.filter((w) => parseSetsReps(w.setsReps, `${e.name} ${e.notes ?? ""}`) || w.load).map((w) => w.week))));
  const days = spreadDays(grid.days.length);
  const weeks: PlanWeek[] = [];
  let lastLoggedWeek = 0;
  // An exercise's latest prescription, for weeks where only the load is filled in.
  const lastRx = new Map<string, Rx>();
  for (let week = 1; week <= totalWeeks; week++) {
    const planDays = grid.days.slice(0, 7).map((d, i) => {
      // Warm-up, blocks and cool-down from the sheet's labels: the same every week.
      const sections = sectionsFromSheet(d.exercises);
      const entries: PlannedEntry[] = d.exercises.flatMap((e, j) => {
        const cell = e.weeks.find((w) => w.week === week);
        const key = `${i}:${j}`;
        // A load recorded with no sets/reps: done at the previous week's prescription.
        const rx = parseSetsReps(cell?.setsReps, `${e.name} ${e.notes ?? ""}`) ?? (recordsSession(parseLoad(cell?.load)) ? lastRx.get(key) ?? null : null);
        if (!rx) return [];
        lastRx.set(key, rx);
        return [{ exercise: e.name, notes: [e.notes, rx.note].filter(Boolean).join(" · ") || null, section: sections[j], rx, load: parseLoad(cell?.load), rest: e.rest ?? null }];
      });
      const logged = entries.some((x) => recordsSession(x.load));
      if (logged) lastLoggedWeek = Math.max(lastLoggedWeek, week);
      return { name: d.name || `Day ${i + 1}`, dayOfWeek: days[i], entries, logged };
    });
    weeks.push({ week, days: planDays.filter((d) => d.entries.length > 0) });
  }
  return { weeks, lastLoggedWeek };
}

/**
 * The coach's note applied to the plan read from the sheet:
 *  - durationWeeks: a longer block repeats the last week's prescription
 *    (nothing logged); a shorter one drops the weeks past it.
 *  - startAtWeek: that week and everything after it are to do, even if the
 *    sheet has loads in them (e.g. last block's numbers). "Start fresh" (1)
 *    logs nothing from the sheet.
 */
export function shapePlan(
  plan: { weeks: PlanWeek[]; lastLoggedWeek: number },
  ctx: { durationWeeks: number | null; startAtWeek: number | null }
): { weeks: PlanWeek[]; lastLoggedWeek: number } {
  let weeks = plan.weeks;
  if (ctx.durationWeeks != null && weeks.length > 0) {
    if (ctx.durationWeeks < weeks.length) weeks = weeks.slice(0, ctx.durationWeeks);
    const last = weeks[weeks.length - 1];
    while (weeks.length < ctx.durationWeeks) {
      weeks = [
        ...weeks,
        { week: weeks.length + 1, days: last.days.map((d) => ({ ...d, logged: false, entries: d.entries.map((e) => ({ ...e, load: null })) })) },
      ];
    }
  }
  if (ctx.startAtWeek == null) {
    return { weeks, lastLoggedWeek: Math.min(plan.lastLoggedWeek, weeks.length) };
  }
  const start = Math.min(ctx.startAtWeek, weeks.length);
  weeks = weeks.map((w) => (w.week >= start ? { ...w, days: w.days.map((d) => ({ ...d, logged: false })) } : w));
  return { weeks, lastLoggedWeek: start - 1 };
}

/** Week 1's start when the coach doesn't say: far enough back that the first unfilled week is this week. */
export function inferWeekOneStart(lastLoggedWeek: number, today: Date): Date {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setDate(monday.getDate() - lastLoggedWeek * 7);
  return monday;
}

/** How many exercises the plan would have, week 1 to the end. 0 means nothing in the file read as sets and reps. */
export function plannedCount(grid: SheetGrid): number {
  return planFromGrid(grid).weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.entries.length, 0), 0);
}
