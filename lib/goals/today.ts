/**
 * What the Today card shows for a running goal, as plain data. Pure: no I/O.
 */

import { localDay } from "@/lib/athlete/sessions";
import { addDays } from "./days";
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
  rules: Array<{ key: string; label: string; kind: "sessions" | "check_in"; state: RuleState; have: number; need: number; mark: string | null }>;
  /** Today's finished sessions, with the tags each carries. */
  sessions: Array<{ id: string; title: string; minutes: number | null; tags: string[] }>;
  marks: string[];
  needsDuration: Array<{ id: string; title: string }>;
  /** Yesterday, while it can still be filled in. */
  behind: { day: string; items: Array<{ key: string; label: string; kind: "sessions" | "check_in" }> } | null;
  cells: StripCell[];
};

export function todayView(l: LoadedGoal, now = new Date()): TodayView {
  const { goal, result } = l;
  const today = localDay(now, goal.timeZone);
  const ruleOf = (key: string) => goal.rules.rules.find((r) => r.key === key);
  const marks = Array.from(new Set(goal.rules.rules.flatMap((r) => (r.kind === "sessions" && r.where.mark ? [r.where.mark] : []))));

  const tags = new Map<string, string[]>();
  for (const c of l.checkIns) if (c.workoutLogId) tags.set(c.workoutLogId, [...(tags.get(c.workoutLogId) ?? []), c.ruleKey]);
  const title = (s: { title: string | null }) => s.title?.trim() || "Workout";

  const yesterday = result.periods.find((p) => p.day === addDays(today, -1));
  const behindItems =
    yesterday && !yesterday.carried && yesterday.state === "pending"
      ? Object.entries(yesterday.rules).filter(([, s]) => s !== "met").flatMap(([key]) => { const r = ruleOf(key); return r ? [{ key, label: r.label, kind: r.kind }] : []; })
      : [];

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
    rules: result.today.map((t) => ({ key: t.ruleKey, label: t.label, kind: t.kind, state: t.state, have: t.have, need: t.need, mark: (ruleOf(t.ruleKey) as { where?: { mark?: string } } | undefined)?.where?.mark ?? null })),
    sessions: l.sessions.filter((s) => s.day === today).map((s) => ({ id: s.id, title: title(s), minutes: s.durationMin, tags: tags.get(s.id) ?? [] })),
    marks,
    needsDuration: l.sessions.filter((s) => result.needsDuration.includes(s.id)).map((s) => ({ id: s.id, title: title(s) })),
    behind: behindItems.length ? { day: addDays(today, -1), items: behindItems } : null,
    cells,
  };
}
