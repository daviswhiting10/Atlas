/**
 * What importing a coach's spreadsheet will do, worked out before anything is
 * saved: the plan's shape, its structure day by day, and, when the coach asks
 * to "Import completed weeks as history", the sessions that will be backdated.
 *
 * saveSheetPlan uses the same pieces (shapeSheet, planStart, dayDate), so
 * what the coach confirms is what gets written.
 *
 * Pure: no I/O.
 */

import { inferWeekOneStart, planFromGrid, shapePlan, timedRows, type PlanWeek, type SheetGrid, type TimedRow } from "./sheet-plan";
import { NO_CONTEXT, describeReadAs, type PlanContext } from "./plan-context";
import { structure } from "@/lib/workouts/structure";

/** The plan as it will be saved: the sheet's weeks with the coach's note applied. */
export function shapeSheet(grid: SheetGrid, context: PlanContext = NO_CONTEXT): { weeks: PlanWeek[]; lastLoggedWeek: number } {
  return shapePlan(planFromGrid(grid), context);
}

/** Week 1's first day: the coach's date, or far enough back that the first week still to do is this week. */
export function planStart(lastLoggedWeek: number, weekOneStart: Date | null | undefined, today: Date): Date {
  if (weekOneStart) return weekOneStart;
  if (lastLoggedWeek > 0) return inferWeekOneStart(lastLoggedWeek, today);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

/** The day a plan workout falls on (the same rule assignProgram schedules by: one block per week). */
export function dayDate(start: Date, week: number, dayOfWeek: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + (week - 1) * 7 + (dayOfWeek - 1));
  d.setHours(12, 0, 0, 0);
  return d;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type ImportSummary = {
  /** "4 weeks · 3 days a week · starting at week 3". */
  readAs: string;
  weeks: number;
  daysPerWeek: number;
  exercises: number;
  /** Week 1's first day (YYYY-MM-DD). */
  weekOneStart: string;
  /** Weeks the sheet shows as done (after the coach's note). */
  completedWeeks: number;
  /** Each day's structure, from week 1: "Warm-up 1 · Block 1 (1A, 1B) · Block 2 (2) · Cool-down none". */
  days: Array<{ name: string; warmup: number; blocks: number[]; cooldown: number }>;
  /** The sessions that would be backdated, when completed weeks are imported as history. */
  history: {
    sessions: number;
    sets: number;
    /** First and last day (YYYY-MM-DD). */
    from: string | null;
    to: string | null;
    perWeek: Array<{ week: number; sessions: number; sets: number }>;
  };
  /** Every exercise done for time, shown in minutes; `unclear` ones ask for the unit. */
  times: TimedRow[];
};

export function summarizeSheetImport(input: { grid: SheetGrid; context?: PlanContext; weekOneStart?: Date | null; today: Date }): ImportSummary {
  const { weeks, lastLoggedWeek } = shapeSheet(input.grid, input.context);
  const start = planStart(lastLoggedWeek, input.weekOneStart, input.today);
  const daysPerWeek = Math.max(0, ...weeks.map((w) => w.days.length));
  const exercises = new Set(weeks.flatMap((w) => w.days.flatMap((d) => d.entries.map((e) => e.exercise.toLowerCase())))).size;

  const perWeek: ImportSummary["history"]["perWeek"] = [];
  const dates: Date[] = [];
  for (const w of weeks) {
    const done = w.days.filter((d) => d.logged);
    if (done.length === 0) continue;
    perWeek.push({ week: w.week, sessions: done.length, sets: done.reduce((n, d) => n + d.entries.reduce((m, e) => m + (e.added ? 0 : e.rx.sets), 0), 0) });
    for (const d of done) dates.push(dayDate(start, w.week, d.dayOfWeek));
  }
  dates.sort((a, b) => a.getTime() - b.getTime());

  const first = weeks[0];
  return {
    readAs: describeReadAs({ weeks: weeks.length, days: daysPerWeek, startAtWeek: Math.min(lastLoggedWeek + 1, weeks.length) }),
    weeks: weeks.length,
    daysPerWeek,
    exercises,
    weekOneStart: iso(start),
    completedWeeks: lastLoggedWeek,
    days: (first?.days ?? []).map((d) => {
      const s = structure(d.entries, (e) => e.section);
      return { name: d.name, warmup: s.warmup.length, blocks: s.blocks.map((b) => b.items.length), cooldown: s.cooldown.length };
    }),
    history: {
      sessions: dates.length,
      sets: perWeek.reduce((n, w) => n + w.sets, 0),
      from: dates.length ? iso(dates[0]) : null,
      to: dates.length ? iso(dates[dates.length - 1]) : null,
      perWeek,
    },
    times: timedRows(input.grid),
  };
}

/** One line per day for the preview: "Warm-up 1 · Block 1 (3) · Block 2 (1) · Cool-down none". */
export function describeDay(d: ImportSummary["days"][number]): string {
  const count = (n: number) => (n === 0 ? "none" : String(n));
  return [`Warm-up ${count(d.warmup)}`, ...d.blocks.map((n, i) => `Block ${i + 1} (${n})`), `Cool-down ${count(d.cooldown)}`].join(" · ");
}
