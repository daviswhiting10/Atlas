/**
 * Lighter weeks: the last week of every 4-week block, the athlete keeps the
 * weights and stops each set a couple of reps short. One rule, used by the
 * Plan view, the logger's targets, the progress charts and the MCP tools.
 *
 * It is a setting on each plan. Left unset, generated plans have it on (the
 * generator's blocks are built around it) and hand-built plans have it off
 * (a coach may have written their own back-off weeks, and the app shouldn't
 * add a second one on top). Either can be switched.
 */

import { BLOCK_WEEKS } from "./generator";
import { weekOf } from "@/lib/athlete/sessions";

export type LighterSource = {
  startDate: Date;
  lighterWeeks: boolean | null;
  sourceProgram: { goalTags: unknown };
};

/** Prisma select for everything the rule needs from a plan. */
export const LIGHTER_SELECT = {
  startDate: true,
  lighterWeeks: true,
  sourceProgram: { select: { goalTags: true } },
} as const;

/** True when the program was generated (its generator preferences are stored with it). */
export function isGenerated(goalTags: unknown): boolean {
  const prefs = (goalTags as { prefs?: unknown } | null)?.prefs;
  return prefs != null && typeof prefs === "object";
}

/**
 * Whether a plan has lighter weeks. `selfServe` covers athletes' own plans
 * from before the generator's preferences were stored with the program.
 */
export function lighterWeeksOn(plan: Pick<LighterSource, "lighterWeeks" | "sourceProgram">, selfServe = false): boolean {
  return plan.lighterWeeks ?? (selfServe || isGenerated(plan.sourceProgram.goalTags));
}

/** Whether a workout scheduled on `date` falls in one of the plan's lighter weeks. */
export function isLighterWeek(date: Date, plan: LighterSource, selfServe = false): boolean {
  return lighterWeeksOn(plan, selfServe) && weekOf(date.getTime(), plan.startDate.getTime()) % BLOCK_WEEKS === 0;
}
