/**
 * Program categories, in the coach's words. Each is stored as the coach tag
 * the plan generator already understands (lib/plan/generator COACH_GOALS),
 * so "Generate from these goals" keeps working; only the label is friendlier.
 */
export const CATEGORIES = [
  { tag: "Weight Loss", label: "Weight loss", goalCode: "weight_loss" },
  { tag: "Hypertrophy", label: "Muscle gain", goalCode: "hypertrophy" },
  { tag: "Strength", label: "Strength", goalCode: "performance" },
  { tag: "Corrective", label: "Pain management", goalCode: "pain_mgmt" },
  { tag: "Athletic Performance", label: "Athletic performance", goalCode: "performance" },
  { tag: "Endurance", label: "Endurance", goalCode: "general" },
  { tag: "General Fitness", label: "General fitness", goalCode: "general" },
] as const;

export type CategoryTag = (typeof CATEGORIES)[number]["tag"];
export const UNCATEGORIZED = "Uncategorized";

const BY_TAG = new Map<string, (typeof CATEGORIES)[number]>(CATEGORIES.map((c) => [c.tag, c]));
export const isCategoryTag = (t: string): t is CategoryTag => BY_TAG.has(t);
export const categoryLabel = (tag: string) => BY_TAG.get(tag)?.label ?? tag;

/** A program's category: the first of its goal tags that is one. */
export function categoryOf(goalTags: unknown): CategoryTag | null {
  const goals = (goalTags as { goals?: unknown } | null)?.goals;
  if (!Array.isArray(goals)) return null;
  return (goals.find((g): g is CategoryTag => typeof g === "string" && isCategoryTag(g)) as CategoryTag | undefined) ?? null;
}
