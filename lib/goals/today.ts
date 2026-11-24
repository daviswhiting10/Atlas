/**
 * What the Today card shows for a running goal, as plain data. Pure: no I/O.
 */

import { localDay } from "@/lib/athlete/sessions";
import { addDays } from "./days";
import { ruleActiveOn } from "./rules";
import { DEFAULT_DIET, DIET_KEY } from "./templates";
import type { LoadedGoal } from "./data";
import type { RuleState } from "./evaluate";

export type StripCell = "carried" | "met" | "partial" | "rest" | "excused" | "open" | "future";

export type TodayView = {
  goalId: string;
  name: string;
  today: string;
  dayOfGoal: number;
  length: number;
  attemptNumber: number;
  /** The longest earlier attempt, when this isn't the first. */
  earlierBest: number | null;
  rules: Array<{ key: string; label: string; kind: "sessions" | "check_in"; state: RuleState; have: number; need: number; mark: string | null; minMinutes: number | null; /** The line the person wrote under the rule (the diet), if the rule has one. */ detail: string | null }>;
  /**
   * The day's workout slots: the goal's plain "sessions per day" rule (two workouts a day for 75 Hard).
   * Null when the goal has none, and then there are no workout rows.
   */
  workout: { ruleKey: string; need: number; defaultMinutes: number; mark: string | null } | null;
  /** Today's finished sessions, with the tags each carries. */
  sessions: Array<{ id: string; title: string; minutes: number | null; tags: string[]; sets: number }>;
  marks: string[];
  needsDuration: Array<{ id: string; title: string }>;
  /** Yesterday, while it can still be filled in. Always null for a goal a miss fails (today only). */
  behind: {
    day: string;
    items: Array<{ key: string; label: string; kind: "sessions" | "check_in" }>;
    /** Yesterday's finished workouts, for its workout rows (the same slots as today's). Null when the goal has no workout slots. */
    workout: { sessions: Array<{ id: string; title: string; minutes: number | null; tags: string[]; sets: number }> } | null;
  } | null;
  cells: StripCell[];
  /** The collapsed "Diet & end goal" area. The rules themselves are fixed (the challenge's own); only the diet's wording is the person's. */
  manage: {
    /** What the diet rule says, or null when the goal has no diet rule. */
    diet: string | null;
    /** Days from before Atlas that count as done, when the goal was started back-dated. */
    carried: { days: number; from: string; to: string } | null;
  };
};

/** What a rule's line says: the person's own words, or the template's default for the diet. */
const detailOf = (r: { key: string; kind: string; detail?: string }): string | null => (r.kind === "check_in" ? (r.detail ?? (r.key === DIET_KEY ? DEFAULT_DIET : null)) : null);

export function todayView(l: LoadedGoal, now = new Date()): TodayView {
  const { goal, result } = l;
  const today = localDay(now, goal.timeZone);
  const ruleOf = (key: string) => goal.rules.rules.find((r) => r.key === key);
  const marks = Array.from(new Set(goal.rules.rules.flatMap((r) => (r.kind === "sessions" && r.where.mark ? [r.where.mark] : []))));

  const tags = new Map<string, string[]>();
  for (const c of l.checkIns) if (c.workoutLogId) tags.set(c.workoutLogId, [...(tags.get(c.workoutLogId) ?? []), c.ruleKey]);
  const title = (s: { title: string | null }) => s.title?.trim() || "Workout";

  const yesterdayDay = addDays(today, -1);
  const yesterday = result.periods.find((p) => p.day === yesterdayDay);
  const behindItems =
    // A goal a miss fails only ever asks about today.
    goal.rules.missFails !== true && yesterday && !yesterday.carried && yesterday.state === "pending"
      ? Object.entries(yesterday.rules).filter(([, s]) => s !== "met").flatMap(([key]) => { const r = ruleOf(key); return r ? [{ key, label: r.label, kind: r.kind }] : []; })
      : [];

  const primary = goal.rules.rules
    .flatMap((r) => (r.kind === "sessions" && r.per === "day" && !r.where.mark && ruleActiveOn(r, today) ? [r] : []))
    .sort((a, b) => b.min - a.min)[0];
  const carried = result.periods.filter((p) => p.carried);
  const current = result.attempts.find((a) => a.current);
  const cells: StripCell[] = [];
  for (const p of result.periods) {
    if (current && p.day < current.fromDay) continue;
    cells.push(p.carried ? "carried" : p.state === "met" ? "met" : "open");
  }
  while (cells.length < result.length) cells.push("future");

  const earlier = result.attempts.filter((a) => !a.current);
  return {
    goalId: goal.id,
    name: goal.name,
    today,
    dayOfGoal: result.dayOfGoal,
    length: result.length,
    attemptNumber: result.attemptNumber,
    earlierBest: earlier.length ? Math.max(...earlier.map((a) => a.days)) : null,
    rules: result.today.map((t) => ({ key: t.ruleKey, label: t.label, kind: t.kind, state: t.state, have: t.have, need: t.need, mark: (ruleOf(t.ruleKey) as { where?: { mark?: string } } | undefined)?.where?.mark ?? null, minMinutes: (ruleOf(t.ruleKey) as { where?: { minMinutes?: number } } | undefined)?.where?.minMinutes ?? null, detail: detailOf({ key: t.ruleKey, kind: t.kind, detail: (ruleOf(t.ruleKey) as { detail?: string } | undefined)?.detail }) })),
    workout: primary ? { ruleKey: primary.key, need: primary.min, defaultMinutes: primary.where.minMinutes ?? 45, mark: marks[0] ?? null } : null,
    sessions: l.sessions.filter((s) => s.day === today).map((s) => ({ id: s.id, title: title(s), minutes: s.durationMin, tags: tags.get(s.id) ?? [], sets: s.sets })),
    marks,
    needsDuration: l.sessions.filter((s) => result.needsDuration.includes(s.id)).map((s) => ({ id: s.id, title: title(s) })),
    behind: behindItems.length
      ? {
          day: yesterdayDay,
          items: behindItems,
          workout: primary ? { sessions: l.sessions.filter((s) => s.day === yesterdayDay).map((s) => ({ id: s.id, title: title(s), minutes: s.durationMin, tags: tags.get(s.id) ?? [], sets: s.sets })) } : null,
        }
      : null,
    cells,
    manage: {
      diet: (() => {
        const d = goal.rules.rules.find((r) => r.key === DIET_KEY && r.kind === "check_in");
        return d ? detailOf({ key: d.key, kind: d.kind, detail: (d as { detail?: string }).detail }) : null;
      })(),
      carried: carried.length ? { days: carried.length, from: carried[0].day, to: carried[carried.length - 1].day } : null,
    },
  };
}
