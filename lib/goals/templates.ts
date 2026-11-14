/**
 * Built-in goal templates. They live in code (versioned in git) rather than in
 * a table; a goal copies the rules when it starts.
 */

import { GoalRules } from "./rules";

export type GoalCategory = "challenge" | "consistency" | "block" | "season";

export type Template = { key: string; name: string; category: GoalCategory; blurb: string; rules: GoalRules };

export const SEVENTY_FIVE_HARD: Template = {
  key: "builtin:75hard",
  name: "75 Hard",
  category: "challenge",
  blurb: "Every day. A missed day starts over at day 1.",
  rules: GoalRules.parse({
    length: { days: 75 },
    onMiss: "reset",
    rules: [
      { key: "workouts", label: "Two workouts, 45+ min", kind: "sessions", per: "day", min: 2, where: { minMinutes: 45 } },
      // The outdoor workout is one of the two, not a third.
      { key: "outdoors", label: "One of them outdoors", kind: "sessions", per: "day", min: 1, where: { minMinutes: 45, mark: "outdoors" } },
      { key: "water", label: "Water", kind: "check_in", per: "day", value: "done" },
      { key: "reading", label: "Reading", kind: "check_in", per: "day", value: "done" },
      { key: "diet", label: "Diet", kind: "check_in", per: "day", value: "done" },
      // A plain tick: no photo is stored.
      { key: "photo", label: "Progress photo", kind: "check_in", per: "day", value: "done" },
    ],
  }),
};

export const TEMPLATES: Template[] = [SEVENTY_FIVE_HARD];

export const templateByKey = (key: string | null | undefined): Template | null => TEMPLATES.find((t) => t.key === key) ?? null;
