/**
 * Judge a goal against the sessions that already exist.
 *
 * A goal is a lens: it reads finished sessions and a few ticks, and works out
 * the rest (the day counter, attempts, resets, what's left today) every time.
 * Nothing here writes to a session.
 *
 * - A session counts on the day it was done, in the goal's timezone.
 * - A day closes at the end of the FOLLOWING day, so a late log still counts
 *   and never causes a reset.
 * - A session with no duration under a "45+ min" rule isn't silently failed:
 *   while the day is open the rule reads "needs duration"; once the day
 *   closes, it doesn't count.
 * - The first missed day ends the attempt; the next calendar day is day 1.
 * - Days "carried in" (from before Atlas) count as met with nothing to check.
 * - Rules have a span: a rule added later only judges days from its `fromDay`,
 *   so days already judged keep their result.
 *
 * Pure: no I/O. See docs/goals-layer.md.
 */

import { localDay } from "@/lib/athlete/sessions";
import { addDays, daysBetween } from "./days";
import { ruleActiveOn, type GoalRules, type Rule } from "./rules";

/** The facts about a goal that judging needs. */
export type GoalInput = { startDay: string; timeZone: string; rules: GoalRules };
/** A FINISHED session (the caller only passes sessions with completedAt set). */
export type SessionInput = { id: string; date: Date; durationMin: number | null };
/** A tick (workoutLogId null) or a tag on a session (workoutLogId set, ruleKey = the mark). */
export type CheckInInput = { ruleKey: string; day: string; workoutLogId: string | null; excuse: boolean };

export type RuleState = "met" | "needs_duration" | "open" | "missed";
export type DayResult = {
  day: string;
  rules: Record<string, RuleState>;
  excused: string[];
  /** met: every rule met · missed: a closed day with a rule unmet · pending: still open */
  state: "met" | "pending" | "missed";
  /** From before Atlas: met without sessions or ticks. */
  carried?: boolean;
};
export type Attempt = { fromDay: string; toDay: string | null; days: number; current: boolean };
export type TodayRule = { ruleKey: string; label: string; kind: Rule["kind"]; need: number; have: number; state: RuleState; sessionIds: string[] };

export type GoalResult = {
  started: boolean;
  /** The goal's days so far, in order. */
  periods: DayResult[];
  /** Every attempt, oldest first. The last is the current one unless the goal finished. */
  attempts: Attempt[];
  attemptNumber: number;
  /** Position in the current attempt, counting today (0 before the goal starts). */
  dayOfGoal: number;
  length: number;
  streak: { current: number; best: number };
  /** Days that ended an attempt. */
  misses: number;
  /** Finished sessions that need a duration for an open day to count. */
  needsDuration: string[];
  today: TodayRule[];
  suggestion: "keep_going" | "complete";
  /** The last day of an attempt that met every rule for the whole length (once that day has closed). */
  completedOn: string | null;
};

export type EvaluateOptions = {
  /** Don't look past this day (a goal that has ended). */
  lastDay?: string;
  /** Treat every day as closed, whatever the clock says (a chapter being sealed). */
  closeAll?: boolean;
};

export function evaluateGoal(goal: GoalInput, sessions: SessionInput[], checkIns: CheckInInput[], now: Date, opts: EvaluateOptions = {}): GoalResult {
  const tz = goal.timeZone;
  const today = localDay(now, tz);
  const length = goal.rules.length.days;
  const through = opts.lastDay && opts.lastDay < today ? opts.lastDay : today;
  const empty: GoalResult = { started: false, periods: [], attempts: [], attemptNumber: 0, dayOfGoal: 0, length, streak: { current: 0, best: 0 }, misses: 0, needsDuration: [], today: [], suggestion: "keep_going", completedOn: null };
  if (through < goal.startDay) return empty;

  // Index what we were given.
  const byDay = new Map<string, SessionInput[]>();
  for (const s of sessions) {
    const d = localDay(s.date, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const finished = new Set(sessions.map((s) => s.id));
  const marks = new Map<string, Set<string>>(); // session id → marks. A tag on a session that is gone or unfinished is ignored.
  const ticks = new Set<string>(); // `${ruleKey}|${day}`
  const excusedKeys = new Set<string>();
  for (const c of checkIns) {
    if (c.workoutLogId) {
      if (finished.has(c.workoutLogId)) marks.set(c.workoutLogId, (marks.get(c.workoutLogId) ?? new Set()).add(c.ruleKey));
    } else if (c.excuse) excusedKeys.add(`${c.ruleKey}|${c.day}`);
    else ticks.add(`${c.ruleKey}|${c.day}`);
  }

  const closed = (day: string) => opts.closeAll === true || today >= addDays(day, 2);
  // Carried-in days end at the latest the day before today: today is always real.
  const yesterday = addDays(today, -1);
  const carriedTo = goal.rules.carriedThrough ? (goal.rules.carriedThrough < yesterday ? goal.rules.carriedThrough : yesterday) : null;
  const needsDuration = new Set<string>();

  /** One rule on one day. */
  function judge(rule: Rule, day: string): { state: RuleState; have: number; need: number; sessionIds: string[] } {
    const isClosed = closed(day);
    if (rule.kind === "check_in") {
      const met = ticks.has(`${rule.key}|${day}`) || excusedKeys.has(`${rule.key}|${day}`);
      return { state: met ? "met" : isClosed ? "missed" : "open", have: met ? 1 : 0, need: 1, sessionIds: [] };
    }
    const min = rule.where.minMinutes;
    const tagged = (byDay.get(day) ?? []).filter((s) => !rule.where.mark || marks.get(s.id)?.has(rule.where.mark));
    const counted = tagged.filter((s) => (min == null ? true : s.durationMin != null && s.durationMin >= min));
    const unknown = min == null ? [] : tagged.filter((s) => s.durationMin == null);
    const base = { have: counted.length, need: rule.min, sessionIds: counted.map((s) => s.id) };
    if (counted.length >= rule.min || excusedKeys.has(`${rule.key}|${day}`)) return { state: "met", ...base };
    if (isClosed) return { state: "missed", ...base };
    if (counted.length + unknown.length >= rule.min) {
      unknown.forEach((s) => needsDuration.add(s.id));
      return { state: "needs_duration", ...base };
    }
    return { state: "open", ...base };
  }

  const periods: DayResult[] = [];
  const todayRules: TodayRule[] = [];
  const attempts: Attempt[] = [];
  let from = goal.startDay;
  let metRun = 0;
  let lastMet: string | null = null;
  let completedOn: string | null = null;
  let reachedLength = false;
  let misses = 0;

  for (let day = goal.startDay; day <= through; day = addDays(day, 1)) {
    const active = goal.rules.rules.filter((r) => ruleActiveOn(r, day));
    const states: Record<string, RuleState> = {};
    const excused: string[] = [];
    const carried = carriedTo != null && day <= carriedTo;
    for (const r of carried ? [] : active) {
      const j = judge(r, day);
      states[r.key] = j.state;
      if (excusedKeys.has(`${r.key}|${day}`)) excused.push(r.key);
      if (day === today) todayRules.push({ ruleKey: r.key, label: r.label, kind: r.kind, need: j.need, have: j.have, state: j.state, sessionIds: j.sessionIds });
    }
    if (carried) for (const r of active) states[r.key] = "met";
    const values = Object.values(states);
    const state: DayResult["state"] = values.includes("missed") ? "missed" : values.every((s) => s === "met") ? "met" : "pending";
    periods.push(carried ? { day, rules: states, excused, state, carried: true } : { day, rules: states, excused, state });

    if (state === "missed") {
      attempts.push({ fromDay: from, toDay: lastMet, days: metRun, current: false });
      misses++;
      from = addDays(day, 1);
      metRun = 0;
      lastMet = null;
    } else if (state === "met") {
      metRun++;
      lastMet = day;
      if (metRun === length) {
        reachedLength = true;
        if (closed(day)) completedOn = day;
        break; // the goal's days are used up; nothing after counts
      }
    }
  }

  const lastEvaluated = periods.length ? periods[periods.length - 1].day : goal.startDay;
  if (completedOn) attempts.push({ fromDay: from, toDay: completedOn, days: length, current: false });
  else if (from <= lastEvaluated) attempts.push({ fromDay: from, toDay: lastMet, days: metRun, current: true });

  const inCurrent = completedOn || reachedLength ? length : from <= lastEvaluated ? Math.min(length, daysBetween(from, lastEvaluated) + 1) : 0;
  const best = attempts.reduce((m, a) => Math.max(m, a.days), 0);

  return {
    started: true,
    periods,
    attempts,
    attemptNumber: attempts.length,
    dayOfGoal: inCurrent,
    length,
    streak: { current: completedOn ? length : from <= lastEvaluated ? metRun : 0, best },
    misses,
    needsDuration: Array.from(needsDuration),
    today: lastEvaluated === today ? todayRules : [],
    suggestion: completedOn ? "complete" : "keep_going",
    completedOn,
  };
}
