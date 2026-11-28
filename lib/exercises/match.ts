/**
 * Which of a person's exercises a written name means ("Bench Press" → the "Barbell Bench Press" they log).
 * Pure: the caller reads the candidates (lib/programs/resolve-exercise, resolveForClient).
 *
 * Two names are the same lift when their words (as nameKey writes them: shorthand spelled out, plurals and
 * hyphens aside, order ignored) differ only by words that name the default version of the lift:
 *  - "barbell": a bare lift name is the barbell lift ("Bench Press" is the barbell bench). Dumbbell, kettlebell,
 *    cable, machine and smith are different lifts (a dumbbell weight is one bell), so they always have to be written.
 *  - "flat", "conventional", "standing": the default bench, deadlift and press.
 *  - "back", only next to "squat": "Squat" is the back squat; "Front Squat" has to be written.
 * Any other extra word is a different exercise: "Press" is not "Bench Press", "Bench Press" is not "Incline Bench Press".
 */

import { hasBlockLabel, nameKey } from "./names";

export type Candidate = { id: string; name: string; sets: number };

const DEFAULT_WORDS = new Set(["barbell", "flat", "conventional", "standing"]);

/** 2: the same name; 1: the same lift, a default word added or left out; 0: not the same exercise. */
export function nameMatch(written: string, name: string): 0 | 1 | 2 {
  const a = nameKey(written);
  const b = nameKey(name);
  if (!a || !b) return 0;
  if (a === b) return 2;
  const wa = new Set(a.split(" "));
  const wb = new Set(b.split(" "));
  const squat = wa.has("squat") && wb.has("squat");
  const isDefault = (w: string) => DEFAULT_WORDS.has(w) || (squat && w === "back");
  const differ = [...Array.from(wa).filter((w) => !wb.has(w)), ...Array.from(wb).filter((w) => !wa.has(w))];
  const shared = Array.from(wa).filter((w) => wb.has(w) && !isDefault(w));
  return shared.length > 0 && differ.every(isDefault) ? 1 : 0;
}

/**
 * The candidate a written name means, or null. The same name beats the same lift written with a default word; then
 * the one with the most logged sets (only among real matches); then a clean name (no "1A " label), then the shortest.
 */
export function bestMatch<T extends Candidate>(written: string, candidates: T[]): T | null {
  const scored = candidates.map((c) => ({ c, score: nameMatch(written, c.name) })).filter((x) => x.score > 0);
  scored.sort(
    (x, y) =>
      y.score - x.score ||
      y.c.sets - x.c.sets ||
      Number(hasBlockLabel(x.c.name)) - Number(hasBlockLabel(y.c.name)) ||
      x.c.name.length - y.c.name.length ||
      x.c.name.localeCompare(y.c.name),
  );
  return scored[0]?.c ?? null;
}
