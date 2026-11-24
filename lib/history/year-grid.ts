/**
 * The History heatmap, v3: weeks as columns, seven day rows, Monday first. Pure: no I/O.
 *
 * Three layers on every day:
 * 1. **Colour: work units that day** (lib/history/work: strength sets, plus cardio, walking and mobility minutes scaled to
 *    match), all its sessions added, one hue in five fixed bands: 1-5, 6-10, 11-20, 21-35, 36 and over. A day with no
 *    session is unshaded. A session with no work worked out (a name and a time, imported) still makes it a training day,
 *    at the lightest band. The bands are a first guess, to be tuned on real data.
 * 2. **Corner icon: how you trained** (lib/history/mode): strength, run, walk, or a mix.
 * 3. **Ring: the running challenge.** Closed when the day's rules were met, open (a gap) when not.
 *
 * The window ends on the week of today: 13 weeks on a phone, 26 on a desktop. A month is named above the column that
 * holds its 1st.
 */

import { mondayOf } from "@/lib/athlete/sessions";
import { addDays } from "@/lib/goals/days";
import type { CalendarSession, Challenge } from "./calendar";
import { dayMode, type DayMode } from "./mode";
import { addWork } from "./work";

/** 0 is an empty day; 1 to 5 are the work-unit bands. */
export type GridLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** What the grid needs to know about a day: no ids, no links, no record flags. This is what a browser is sent. */
export type DayInfo = { minutes: number; units: number; sets: number; runMin: number; walkMin: number; mobMin: number; titles: string[]; mode: DayMode | null; ring: "met" | "open" | null };
export type HeatDays = Record<string, DayInfo>;

/** The bands' lower edges in work units (rounded to whole units), for levels 1 to 5. */
export const BANDS = [1, 6, 11, 21, 36] as const;
/** How the bands read in the legend. */
export const BAND_LABELS = ["1-5", "6-10", "11-20", "21-35", "36+"] as const;

/** A day's colour band from its work units. `trained`: it had a session (even one with no work worked out). */
export function bandOf(units: number, trained: boolean): GridLevel {
  if (!trained) return 0;
  const u = Math.round(units);
  if (u >= BANDS[4]) return 5;
  if (u >= BANDS[3]) return 4;
  if (u >= BANDS[2]) return 3;
  if (u >= BANDS[1]) return 2;
  return 1;
}

/**
 * A calendar's days, cut down to DayInfo. Days with sessions, plus every day of the running challenge (a challenge day with
 * nothing logged still gets its open ring).
 */
export function heatDays(byDay: Record<string, CalendarSession[]>, challenge?: Challenge | null): HeatDays {
  const out: HeatDays = {};
  for (const day of Object.keys(byDay)) {
    const list = byDay[day];
    if (list.length === 0) continue;
    const w = addWork(list.map((s) => s.work));
    out[day] = {
      minutes: list.reduce((n, s) => n + (s.minutes ?? 0), 0),
      units: w.units,
      sets: w.sets,
      runMin: w.runMin,
      walkMin: w.walkMin,
      mobMin: w.mobMin,
      titles: list.map((s) => s.title),
      mode: dayMode(list),
      ring: null,
    };
  }
  for (const [day, state] of Object.entries(challenge?.days ?? {})) {
    out[day] = { ...(out[day] ?? { minutes: 0, units: 0, sets: 0, runMin: 0, walkMin: 0, mobMin: 0, titles: [], mode: null }), ring: state };
  }
  return out;
}

export type GridCell = {
  day: string;
  level: GridLevel;
  future: boolean;
  sets: number;
  minutes: number;
  units: number;
  runMin: number;
  walkMin: number;
  mobMin: number;
  titles: string[];
  mode: DayMode | null;
  ring: "met" | "open" | null;
};

export type GridColumn = { monday: string; month: string | null; cells: GridCell[] };

export type YearGrid = { columns: GridColumn[] };

/** Columns on a desktop. */
export const DESKTOP_WEEKS = 26;
/** Columns on a phone: the last 13 weeks, so each cell is wide enough (about 24 px) for its icon and ring. */
export const PHONE_WEEKS = 13;

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

export function yearGrid(byDay: HeatDays, opts: { today: string; weeks?: number }): YearGrid {
  const weeks = opts.weeks ?? DESKTOP_WEEKS;
  const lastMonday = mondayOf(opts.today);
  const columns: GridColumn[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(lastMonday, -7 * i);
    const cells: GridCell[] = Array.from({ length: 7 }, (_, k) => {
      const day = addDays(monday, k);
      const info = byDay[day];
      const future = day > opts.today;
      const trained = !future && info != null && info.titles.length > 0;
      return {
        day,
        level: trained ? bandOf(info.units, true) : 0,
        future,
        sets: info?.sets ?? 0,
        minutes: info?.minutes ?? 0,
        units: info?.units ?? 0,
        runMin: info?.runMin ?? 0,
        walkMin: info?.walkMin ?? 0,
        mobMin: info?.mobMin ?? 0,
        titles: info?.titles ?? [],
        mode: future ? null : (info?.mode ?? null),
        // No ring on a day that hasn't come: only the days the challenge has reached.
        ring: future ? null : (info?.ring ?? null),
      };
    });
    const first = cells.find((c) => parts(c.day).d === 1);
    columns.push({ monday, month: first ? MONTHS[parts(first.day).m] : null, cells });
  }
  return { columns };
}

/** The day's raw numbers, not the units: "22 sets · 45 min run · 20 min walk"; just the minutes for a session with no sets. */
export function rawStats(c: Pick<GridCell, "sets" | "runMin" | "walkMin" | "mobMin" | "minutes">): string | null {
  const parts = [
    c.sets > 0 ? `${c.sets} set${c.sets === 1 ? "" : "s"}` : null,
    c.runMin > 0 ? `${c.runMin} min run` : null,
    c.walkMin > 0 ? `${c.walkMin} min walk` : null,
    c.mobMin > 0 ? `${c.mobMin} min mobility` : null,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  return c.minutes > 0 ? `${c.minutes} min` : null;
}

/** The one line under the grid: "Sat Nov 14 · Long run · 52 min · 75 Hard: not met". */
export function readout(c: GridCell, challenge?: { name: string; today: string } | null): string {
  const head = gridDay(c.day);
  if (c.future) return `${head} · not yet`;
  const ring = c.ring && challenge ? `${challenge.name}: ${c.ring === "met" ? "met" : c.day === challenge.today ? "still open" : "not met"}` : null;
  if (c.titles.length === 0) return [head, "no session", ring].filter(Boolean).join(" · ");
  return [head, c.titles.join(", "), rawStats(c), ring].filter(Boolean).join(" · ");
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
