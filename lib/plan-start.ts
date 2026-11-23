/**
 * Starting a plan on a client's Plan tab: three rows (Import, Build it myself, Atlas builds it). Opening one opens it
 * in place and closes the others. And how the Atlas form's inputs become the generator's preferences (the form uses
 * this very function, so a test can stand in for it).
 *
 * Pure: no I/O.
 */

import { prefsFromCoachTags, type Experience, type Phase, type Prefs } from "@/lib/plan/generator";
import type { Equipment } from "@/lib/plan/catalog";

export type Door = "import" | "own" | "atlas";
export const DOORS: readonly Door[] = ["import", "own", "atlas"];

/** Tapping a row: opens it and closes whichever was open; tapping the open one closes it. */
export const toggleDoor = (open: Door | null, door: Door): Door | null => (open === door ? null : door);

/** The page's ?tab= can ask for a door: the importer, or the Atlas form. */
export function initialDoor(tab: string | null | undefined): Door | null {
  if (tab === "import") return "import";
  if (tab === "build") return "atlas";
  return null;
}

/** Everything the Atlas form asks for: the words, and what sits behind Fine-tune. */
export type PlanStartInputs = {
  goalText: string;
  goals: string[];
  modifiers: string[];
  experience: Experience;
  daysPerWeek: Prefs["daysPerWeek"];
  minutes: Prefs["minutes"];
  equipment: Equipment;
  phases: Phase[];
};

/** The generator's preferences from the form's inputs: every input reaches it. */
export function coachFormPrefs(i: PlanStartInputs): Prefs {
  return prefsFromCoachTags(
    { goal: "muscle", experience: i.experience, daysPerWeek: i.daysPerWeek, minutes: i.minutes, equipment: i.equipment, goalText: i.goalText, phases: i.phases },
    { goals: i.goals, conditions: i.modifiers }
  );
}
