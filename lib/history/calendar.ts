/**
 * The History calendar on Progress (and the coach's Sessions tab): the heatmap's
 * days arranged for a phone, plus what a tap on a day shows.
 *
 * - Rows are Monday-first calendar weeks, **newest week on top** (heatmap()'s
 *   weeks reversed), from the first session or the last 12 months.
 * - A month is named on its top-most row: reading down, the row where the month
 *   changes (the row's first day in range decides, so a straddling week belongs
 *   to the month it starts in).
 * - A **record day** is a day a session set a heaviest-weight-ever on some lift
 *   (prsOverTime, metric "weight"; the first time a lift is done is a baseline,
 *   not a record). It gets the gold ring and nothing else does.
 * - A **chapter** (a finished goal) tints its own days, and its name sits in the
 *   margin of its top-most row.
 * - Each day carries an accessible label, and the whole grid a one-line text
 *   alternative ("41 of the last 52 weeks active, 214 sessions").
 * - **Thin history:** under 3 finished sessions there is no grid, only "Day one"
 *   and the first session. With none at all, there is nothing.
 *
 * Pure: no I/O.
 */

import { localDay } from "@/lib/athlete/sessions";
import { addDays } from "@/lib/goals/days";
import { datedFinished, isLoggedSet } from "./days";
import { heatmap, type HeatLevel } from "./heatmap";
import { prsOverTime } from "./records";
import { sessionMode, type DayMode } from "./mode";
import type { HistorySession } from "./types";

/** Under this many finished sessions, no grid ("Day one"). */
export const CALENDAR_MIN_SESSIONS = 3;

/** What the day sheet lists for one session. */
export type CalendarSession = {
  id: string;
  title: string;
  /** Logged sets; 0 for a session with only a name and a time. */
  sets: number;
  minutes: number | null;
  /** How it was done (strength, run, walk, or a mix); null when nothing says. */
  mode: DayMode | null;
  /** Set a heaviest-weight record on some lift. */
  record: boolean;
  /** Where it opens; null when there is no page for it. */
  href: string | null;
};

export type CalendarDay = {
  day: string;
  level: HeatLevel;
  /** Finished sessions that day (2 or more: a second dot). */
  sessions: number;
  record: boolean;
  /** The chapter this day belongs to, if any (its name). */
  chapter: string | null;
  /** For screen readers: "Tuesday, March 3: 2 sessions, 14 sets, a record". */
  label: string;
};

export type CalendarRow = {
  monday: string;
  /** "Mar", on a month's top-most row. */
  month: string | null;
  /** A chapter's name, on its top-most row. */
  chapter: string | null;
  /** Monday to Sunday; null outside the range (before the first session, after today). */
  days: Array<CalendarDay | null>;
};

export type HistoryCalendar =
  | { kind: "empty" }
  | { kind: "thin"; sessions: number; first: CalendarSession & { day: string } }
  | {
      kind: "grid";
      /** Finished sessions, all time. */
      sessions: number;
      /** The athlete's today (the grid's last day). */
      today: string;
      rows: CalendarRow[];
      /** The grid as one sentence, for screen readers. */
      summary: string;
      /** What a tap on a day shows: that day's sessions, newest first. */
      byDay: Record<string, CalendarSession[]>;
      /** The running challenge, with each of its days met or not (the ring on the heatmap); null when none is running. */
      challenge: Challenge | null;
    };

/** A running challenge's days: met (the day's rules all done) or open (not met, or not over yet). */
export type Challenge = { name: string; days: Record<string, "met" | "open"> };

export type SessionMeta = { title: string; href: string | null };
export type ChapterSpan = { name: string; from: string; to: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const parts = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m: m - 1, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Tuesday, March 3". */
export function longDay(day: string): string {
  const p = parts(day);
  return `${WEEKDAYS[p.wd]}, ${LONG_MONTHS[p.m]} ${p.d}`;
}

/** "Tue, Mar 3". */
export function shortDay(day: string): string {
  const p = parts(day);
  return `${WEEKDAYS[p.wd].slice(0, 3)}, ${MONTHS[p.m]} ${p.d}`;
}

export function historyCalendar(
  sessions: HistorySession[],
  opts: { timeZone: string; today: string; meta: Record<string, SessionMeta>; chapters?: ChapterSpan[]; challenge?: Challenge | null }
): HistoryCalendar {
  const dated = datedFinished(sessions, opts.timeZone, opts.today);
  if (dated.length === 0) return { kind: "empty" };

  // Records: the sessions, and so the days, that set a heaviest weight on some lift.
  const recordSessions = new Set<string>();
  for (const prs of Object.values(prsOverTime(sessions, { metric: "weight", timeZone: opts.timeZone }))) {
    for (const r of prs.records) recordSessions.add(r.sessionId);
  }

  const toCalendarSession = (s: HistorySession): CalendarSession => ({
    id: s.id,
    title: opts.meta[s.id]?.title ?? "Workout",
    sets: s.sets.filter(isLoggedSet).length,
    minutes: s.durationMin,
    mode: sessionMode(s),
    record: recordSessions.has(s.id),
    href: opts.meta[s.id]?.href ?? null,
  });

  if (dated.length < CALENDAR_MIN_SESSIONS) {
    const { session, day } = dated[0];
    return { kind: "thin", sessions: dated.length, first: { ...toCalendarSession(session), day } };
  }

  const byDay: Record<string, CalendarSession[]> = {};
  for (const { session, day } of dated) (byDay[day] ??= []).unshift(toCalendarSession(session));
  const recordDays = new Set(Object.entries(byDay).filter(([, list]) => list.some((s) => s.record)).map(([day]) => day));

  // Chapter membership, day by day (a later chapter wins a shared day).
  const chapterOf = new Map<string, string>();
  for (const c of opts.chapters ?? []) {
    for (let d = c.from; d <= c.to; d = addDays(d, 1)) chapterOf.set(d, c.name);
  }

  const heat = heatmap(sessions, { timeZone: opts.timeZone, today: opts.today });
  const rows: CalendarRow[] = [];
  let lastMonth = -1;
  const named = new Set<string>();
  for (const week of [...heat.weeks].reverse()) {
    const days = week.days.map((d): CalendarDay | null => {
      if (!d) return null;
      const record = recordDays.has(d.day);
      const bits = d.sessions === 0 ? ["no session"] : [plural(d.sessions, "session", "sessions"), ...(d.sets > 0 ? [plural(d.sets, "set", "sets")] : []), ...(record ? ["a record"] : [])];
      return { day: d.day, level: d.level, sessions: d.sessions, record, chapter: chapterOf.get(d.day) ?? null, label: `${longDay(d.day)}: ${bits.join(", ")}` };
    });
    const m = parts(days.find((d) => d != null)?.day ?? week.monday).m;
    const month = m !== lastMonth ? MONTHS[m] : null;
    lastMonth = m;
    const chapterHere = days.find((d) => d?.chapter && !named.has(d.chapter))?.chapter ?? null;
    if (chapterHere) named.add(chapterHere);
    rows.push({ monday: week.monday, month, chapter: chapterHere, days });
  }

  return {
    kind: "grid",
    sessions: dated.length,
    today: opts.today,
    rows,
    summary: `${heat.activeWeeks} of the last ${plural(heat.weeksInRange, "week", "weeks")} active, ${plural(dated.length, "session", "sessions")}`,
    byDay,
    challenge: opts.challenge ?? null,
  };
}

/** A finished goal as a band: its start day to the day it ended, in the athlete's zone. */
export function chapterSpan(goal: { name: string; startDay: string; endedAt: Date | null }, timeZone: string, today: string): ChapterSpan {
  return { name: goal.name, from: goal.startDay, to: goal.endedAt ? localDay(goal.endedAt, timeZone) : today };
}
