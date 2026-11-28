/**
 * The four goals a person can pick on the You tab: Build muscle, Lose fat, Maintenance, Pain-free. Each is a plain setting of
 * the plan generator (its `goal`, and for Pain-free the "post-rehab" condition, which keeps the work gentle and corrective), so
 * nothing the generator already knows about is lost. Older plans that were made for "Get stronger" keep working; it is just
 * no longer offered. Pure: no I/O.
 */
import type { Goal, Prefs } from "./generator";

export type GoalPick = { key: "muscle" | "fat_loss" | "maintenance" | "pain_free"; label: string; goal: Goal; painFree: boolean };

export const GOAL_PICKS: readonly GoalPick[] = [
  { key: "muscle", label: "Build muscle", goal: "muscle", painFree: false },
  { key: "fat_loss", label: "Lose fat", goal: "fat_loss", painFree: false },
  { key: "maintenance", label: "Maintenance", goal: "general", painFree: false },
  { key: "pain_free", label: "Pain-free", goal: "general", painFree: true },
];

const hasRehab = (p: Pick<Prefs, "conditions">) => (p.conditions ?? []).includes("post_rehab");

/** Is this pick what the prefs say? (Pain-free and Maintenance are both the general goal; the condition tells them apart.) */
export function isPicked(pick: GoalPick, prefs: Pick<Prefs, "goal" | "conditions">): boolean {
  return prefs.goal === pick.goal && hasRehab(prefs) === pick.painFree;
}

/** The prefs after choosing `pick`. Only the goal and the pain-free condition change; every other condition is kept. */
export function applyPick<T extends Pick<Prefs, "goal" | "conditions">>(prefs: T, pick: GoalPick): T {
  const others = (prefs.conditions ?? []).filter((c) => c !== "post_rehab");
  return { ...prefs, goal: pick.goal, conditions: pick.painFree ? [...others, "post_rehab"] : others };
}
