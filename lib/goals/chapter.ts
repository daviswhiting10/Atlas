/**
 * A finished goal, written down once. `freezeChapter` is the same function
 * whether it draws the live draft or the sealed copy, so the page looks the
 * same before and after.
 *
 * It judges the goal with every day treated as closed (an open day that
 * wasn't met is simply not met) and never looks past the goal's last day.
 * The word "missed" stays in the data; the wording here never uses it.
 *
 * This first slice leaves out `records`, `tonnageLb` and lifts; the shape is
 * the doc's, so a rebuild can add them (docs/archive-and-chapters.md).
 *
 * Pure: no I/O.
 */

import { localDay } from "@/lib/athlete/sessions";
import { daysBetween } from "./days";
import { evaluateGoal, type CheckInInput, type DayResult, type GoalInput } from "./evaluate";
import type { GoalCategory } from "./templates";

/** "carried" is a day from before Atlas (an addition to the doc's five states). */
export type ChapterCell = "met" | "partial" | "rest" | "excused" | "paused" | "carried";

export type Chapter = {
  v: 1;
  sealedAt: string;
  name: string;
  category: GoalCategory;
  outcome: "completed" | "ended";
  line: string;
  range: { startDay: string; endDay: string; days: number };
  numbers: {
    sessions: number;
    sets: number;
    /** Null when fewer than half the sessions have a duration. */
    minutes: number | null;
    activeDays: number;
    bestRun: { days: number; from: string; to: string };
  };
  /** Days from before Atlas, counted as met without sessions; null when there were none. */
  carriedIn: { from: string; to: string; days: number } | null;
  /** Only attempts that got somewhere (at least one day). */
  attempts: { from: string; to: string; days: number }[];
  strip: { unit: "day"; cells: ChapterCell[] };
  rules: { key: string; label: string; met: number; of: number }[];
};

export type ChapterGoal = GoalInput & { name: string; category: GoalCategory; endedAt: Date };
export type ChapterSession = { id: string; date: Date; durationMin: number | null; sets: number };

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

function cellFor(d: DayResult): ChapterCell {
  if (d.carried) return "carried";
  const states = Object.values(d.rules);
  if (states.length === 0) return "met";
  const met = states.filter((s) => s === "met").length;
  if (met === states.length) return d.excused.length > 0 ? "excused" : "met";
  return met > 0 ? "partial" : "rest";
}

export function freezeChapter(goal: ChapterGoal, sessions: ChapterSession[], checkIns: CheckInInput[], sealedAt: Date): Chapter {
  const lastDay = localDay(goal.endedAt, goal.timeZone);
  const result = evaluateGoal(goal, sessions, checkIns, sealedAt, { lastDay, closeAll: true });
  const outcome = result.completedOn ? "completed" : "ended";
  const startDay = goal.startDay;
  const endDay = result.completedOn ?? (result.periods.length ? result.periods[result.periods.length - 1].day : startDay);

  const inRange = sessions.filter((s) => {
    const d = localDay(s.date, goal.timeZone);
    return d >= startDay && d <= endDay;
  });
  const withDuration = inRange.filter((s) => s.durationMin != null);
  const best = result.attempts.reduce((b, a) => (a.days > b.days ? a : b), result.attempts[0] ?? { fromDay: startDay, toDay: startDay, days: 0, current: false });

  const carried = result.periods.filter((p) => p.carried);
  const lastAttempt = result.attempts[result.attempts.length - 1];
  const line =
    outcome === "completed"
      ? result.attemptNumber <= 1
        ? `Completed. ${result.length} days.`
        : `Completed. ${result.length} days, ${ORDINALS[result.attemptNumber - 1] ?? `attempt ${result.attemptNumber}`} attempt.`
      : `Ended on day ${Math.max(1, lastAttempt?.days ?? 0)}.`;

  return {
    v: 1,
    sealedAt: sealedAt.toISOString(),
    name: goal.name,
    category: goal.category,
    outcome,
    line,
    range: { startDay, endDay, days: daysBetween(startDay, endDay) + 1 },
    numbers: {
      sessions: inRange.length,
      sets: inRange.reduce((n, s) => n + s.sets, 0),
      minutes: inRange.length > 0 && withDuration.length * 2 >= inRange.length ? withDuration.reduce((n, s) => n + (s.durationMin ?? 0), 0) : null,
      activeDays: new Set(inRange.map((s) => localDay(s.date, goal.timeZone))).size,
      bestRun: { days: best.days, from: best.fromDay, to: best.toDay ?? best.fromDay },
    },
    carriedIn: carried.length ? { from: carried[0].day, to: carried[carried.length - 1].day, days: carried.length } : null,
    attempts: result.attempts.filter((a) => a.days > 0 && a.toDay).map((a) => ({ from: a.fromDay, to: a.toDay as string, days: a.days })),
    strip: { unit: "day", cells: result.periods.map(cellFor) },
    rules: goal.rules.rules.map((r) => {
      // Totals are for days Atlas could check; carried-in days are shown separately.
      const judged = result.periods.filter((p) => !p.carried && r.key in p.rules);
      return { key: r.key, label: r.label, met: judged.filter((p) => p.rules[r.key] === "met").length, of: judged.length };
    }),
  };
}

/** When a goal that ran its length ended: the end of its last day. */
export { endOfDay } from "./days";
