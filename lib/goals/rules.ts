/**
 * What a goal asks of a person each day, and the checks that keep a stored
 * rule set sane. See docs/goals-layer.md.
 *
 * This first slice supports one length (a number of days), daily rules only,
 * and "start again at day 1" on a miss. Weekly, plan-adherence and lift rules
 * come later; the shapes here are the doc's, so they slot in without changes.
 *
 * A rule is never deleted from a running goal. Removing one sets `toDay`, so
 * the days it judged keep their result; adding one sets `fromDay`.
 *
 * Pure: no I/O.
 */

import { z } from "zod";

export const DAY = /^\d{4}-\d{2}-\d{2}$/;
const Day = z.string().regex(DAY);
const Key = z.string().min(1).max(40).regex(/^[a-z0-9_]+$/);
const Label = z.string().trim().min(1).max(60);

/** Where a rule starts and stops counting (inclusive). Missing = the whole goal. */
const Span = { fromDay: Day.optional(), toDay: Day.optional() };

/** N finished sessions in a day. `mark` is a fact about a session a person tags (for example "outdoors"). */
const SessionsRule = z.object({
  key: Key,
  label: Label,
  kind: z.literal("sessions"),
  per: z.literal("day"),
  min: z.number().int().min(1).max(10),
  where: z
    .object({
      minMinutes: z.number().int().min(1).max(600).optional(),
      mark: Key.optional(),
    })
    .default({}),
  ...Span,
});

/** A tick for the day ("done"). Nothing is stored beyond the tick itself. */
const CheckInRule = z.object({
  key: Key,
  label: Label,
  kind: z.literal("check_in"),
  per: z.literal("day"),
  value: z.literal("done").default("done"),
  ...Span,
});

export const Rule = z.discriminatedUnion("kind", [SessionsRule, CheckInRule]);
export type Rule = z.infer<typeof Rule>;

export const GoalRules = z
  .object({
    length: z.object({ days: z.number().int().min(1).max(366) }),
    rules: z.array(Rule).min(1).max(20),
    onMiss: z.literal("reset"),
  })
  .superRefine((g, ctx) => {
    const keys = g.rules.map((r) => r.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Two rules share a key." });
    for (const r of g.rules) {
      if (r.fromDay && r.toDay && r.toDay < r.fromDay) ctx.addIssue({ code: "custom", message: `"${r.label}" stops before it starts.` });
    }
  });
export type GoalRules = z.infer<typeof GoalRules>;

/** Is the rule in force on this day? */
export const ruleActiveOn = (r: Pick<Rule, "fromDay" | "toDay">, day: string): boolean => (!r.fromDay || day >= r.fromDay) && (!r.toDay || day <= r.toDay);

/** A key for a rule a person types in ("No alcohol" → "no_alcohol"), unique among the existing keys. */
export function keyForLabel(label: string, existing: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "rule";
  let key = base;
  for (let n = 2; existing.includes(key); n++) key = `${base}_${n}`;
  return key;
}

/** Add a daily tick rule that counts from `today`. */
export function addCheckInRule(rules: GoalRules, label: string, today: string): GoalRules {
  const clean = label.replace(/\s+/g, " ").trim();
  const key = keyForLabel(clean, rules.rules.map((r) => r.key));
  return GoalRules.parse({ ...rules, rules: [...rules.rules, { key, label: clean, kind: "check_in", per: "day", value: "done", fromDay: today }] });
}

/** Stop counting a rule from the day after `today`; the days it already judged keep their result. */
export function removeRule(rules: GoalRules, key: string, today: string): GoalRules {
  const target = rules.rules.find((r) => r.key === key);
  if (!target) throw new Error("No such rule");
  // A rule added today and removed today never judged a day: drop it outright.
  const neverJudged = target.fromDay != null && target.fromDay >= today;
  const next = neverJudged ? rules.rules.filter((r) => r.key !== key) : rules.rules.map((r) => (r.key === key ? { ...r, toDay: today } : r));
  // Something must still be judged from tomorrow on.
  if (!next.some((r) => !r.toDay || r.toDay > today)) throw new Error("A goal needs at least one rule.");
  return GoalRules.parse({ ...rules, rules: next });
}
