/**
 * The History heatmap as a year grid: weeks are columns, seven day rows, Monday first. Pure: no I/O.
 *
 * - **Intensity is logged sets in a day** (all that day's sessions added), in four steps (1 to 4) from the athlete's own
 *   quartiles: the 25th, 50th and 75th percentile (nearest rank) of every training day in their whole history. So the
 *   steps belong to the person, not to a fixed number of sets, and a light month still shows contrast. A session with no
 *   sets logged still counts as a training day (step 1, "present").
 * - Level 0 is a day with no session; a **future** day (after today, in the last week) is its own state.
 * - The window ends on the week of today. `weeks` is how many columns: a year on a desktop, the last 26 on a phone
 *   (the component shows the older ones only from the md breakpoint up).
 * - A month is named above the column that holds its 1st.
 */

import { mondayOf } from "@/lib/athlete/sessions";
import { addDays } from "@/lib/goals/days";
import type { CalendarSession } from "./calendar";

export type GridLevel = 0 | 1 | 2 | 3 | 4;

export type GridCell = {
  day: string;
  level: GridLevel;
  future: boolean;
  sets: number;
  titles: string[];
  minutes: number;
};

export type GridColumn = { monday: string; month: string | null; cells: GridCell[] };

export type YearGrid = { columns: GridColumn[]; thresholds: [number, number, number] | null };

/** Columns on a desktop (a year of weeks, plus the partial one). */
export const YEAR_WEEKS = 53;
/** Columns on a phone: the last 26 weeks, so cells stay around 12 px. */
export const PHONE_WEEKS = 26;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parts = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { m: m - 1, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** "Tue Nov 11". */
export function gridDay(day: string): string {
  const p = parts(day);
  return `${WEEKDAYS[p.wd]} ${MONTHS[p.m]} ${p.d}`;
}

/** Sets in a day, with a floor of "present" for a session that logged none. */
const PRESENT = 0.5;
const workOf = (sessions: CalendarSession[]) => {
  const sets = sessions.reduce((n, s) => n + s.sets, 0);
  return sets > 0 ? sets : PRESENT;
};

/** Nearest-rank percentile of an ascending list. */
const percentile = (sorted: number[], q: number) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

/** Steps 1 to 4 from the athlete's own quartiles over every training day they have. */
export function quartileSteps(byDay: Record<string, CalendarSession[]>): [number, number, number] | null {
  const work = Object.values(byDay)
    .filter((s) => s.length > 0)
    .map(workOf)
    .sort((a, b) => a - b);
  return work.length === 0 ? null : [percentile(work, 0.25), percentile(work, 0.5), percentile(work, 0.75)];
}

export function levelOf(work: number, t: [number, number, number] | null): GridLevel {
  if (t == null) return 1;
  return work <= t[0] ? 1 : work <= t[1] ? 2 : work <= t[2] ? 3 : 4;
}

export function yearGrid(byDay: Record<string, CalendarSession[]>, opts: { today: string; weeks?: number }): YearGrid {
  const weeks = opts.weeks ?? YEAR_WEEKS;
  const thresholds = quartileSteps(byDay);
  const lastMonday = mondayOf(opts.today);
  const columns: GridColumn[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(lastMonday, -7 * i);
    const cells: GridCell[] = Array.from({ length: 7 }, (_, k) => {
      const day = addDays(monday, k);
      const sessions = byDay[day] ?? [];
      const future = day > opts.today;
      const trained = !future && sessions.length > 0;
      return {
        day,
        level: trained ? levelOf(workOf(sessions), thresholds) : 0,
        future,
        sets: sessions.reduce((n, s) => n + s.sets, 0),
        titles: sessions.map((s) => s.title),
        minutes: sessions.reduce((n, s) => n + (s.minutes ?? 0), 0),
      };
    });
    const first = cells.find((c) => parts(c.day).d === 1);
    columns.push({ monday, month: first ? MONTHS[parts(first.day).m] : null, cells });
  }
  return { columns, thresholds };
}

/** The one line under the grid: "Tue Nov 11 · Lower A · 14 sets". */
export function readout(c: GridCell): string {
  const head = gridDay(c.day);
  if (c.future) return `${head} · not yet`;
  if (c.titles.length === 0) return `${head} · no session`;
  const size = c.sets > 0 ? `${c.sets} set${c.sets === 1 ? "" : "s"}` : c.minutes > 0 ? `${c.minutes} min` : null;
  return [head, c.titles.join(", "), size].filter(Boolean).join(" · ");
}

/** The most recent training day in the grid (what the readout shows before anything is touched), if any. */
export function latestTrained(g: YearGrid): GridCell | null {
  for (let i = g.columns.length - 1; i >= 0; i--) {
    for (let k = 6; k >= 0; k--) {
      const c = g.columns[i].cells[k];
      if (!c.future && c.titles.length > 0) return c;
    }
  }
  return null;
}
