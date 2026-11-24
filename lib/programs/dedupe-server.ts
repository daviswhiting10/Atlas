/** Server side of the soft dedupe (lib/programs/dedupe.ts): which imported names are a library exercise with a cue. */
import { prisma } from "@/lib/db/client";
import { CATALOG } from "@/lib/plan/catalog";
import { nameKey } from "@/lib/exercises/names";
import { findExerciseByName, visibleTo } from "@/lib/exercises/find";
import { expandShorthand } from "./resolve-exercise";
import type { SheetGrid } from "./sheet-plan";
import type { ExerciseMatch } from "./dedupe";

const STOP = new Set(["to", "the", "a", "an", "with", "on", "of", "and", "for"]);

/** The same words in any order: "goblet squat to box" and "goblet box squat" are one key. */
export const wordsKey = (name: string) =>
  nameKey(expandShorthand(name))
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .sort()
    .join(" ");

/** The name without a cue, and the cue: "(lighter, …)", "— to neutral", "or incline push-up". */
export function splitCue(name: string): { core: string; cue: string | null } {
  let core = name;
  const cues: string[] = [];
  core = core.replace(/\s*\(([^)]*)\)\s*/g, (_, c: string) => {
    if (c.trim()) cues.push(c.trim());
    return " ";
  });
  const dash = core.match(/\s+[—–-]\s+(.+)$/);
  if (dash) {
    cues.push(dash[1].trim());
    core = core.slice(0, dash.index);
  }
  const or = core.match(/\s+or\s+(.+)$/i);
  if (or) {
    cues.push(`or ${or[1].trim()}`);
    core = core.slice(0, or.index);
  }
  core = core.replace(/\s+/g, " ").trim();
  return { core, cue: cues.length ? cues.join("; ") : null };
}

/**
 * For names the resolver wouldn't match, the library exercise each one most likely is. `known` holds the names the
 * resolver already matches (they need nothing). One suggestion per name; none when the match is ambiguous.
 */
export function suggestMatches(names: string[], library: Array<{ id: string; name: string }>, known: Set<string>): ExerciseMatch[] {
  // A library name's own words first; a library name with its own cue ("Leg Press (bilateral)") only when no plain one fits.
  const full = new Map<string, Map<string, { id: string; name: string }>>();
  const cored = new Map<string, Map<string, { id: string; name: string }>>();
  const add = (m: typeof full, k: string, e: { id: string; name: string }) => {
    if (!k) return;
    if (!m.has(k)) m.set(k, new Map());
    m.get(k)!.set(e.id, e);
  };
  for (const e of library) {
    add(full, wordsKey(e.name), e);
    add(cored, wordsKey(splitCue(e.name).core), e);
  }
  const one = (k: string) => {
    for (const m of [full, cored]) {
      const hits = k ? m.get(k) : undefined;
      if (hits?.size === 1) return Array.from(hits.values())[0];
      if (hits && hits.size > 1) return null; // ambiguous: no guess
    }
    return null;
  };
  const out: ExerciseMatch[] = [];
  for (const name of Array.from(new Set(names))) {
    if (known.has(name)) continue;
    const { core, cue } = splitCue(name);
    const whole = one(wordsKey(name));
    const hit = whole ?? (core !== name ? one(wordsKey(core)) : null);
    if (hit && hit.name !== name) out.push({ name, match: hit.name, matchId: hit.id, cue: whole ? null : cue });
  }
  return out.slice(0, 40);
}

/** The suggestions for a grid just read: one read of the library, no exercise created. */
export async function exerciseMatches(grid: SheetGrid, workspaceId: string): Promise<ExerciseMatch[]> {
  const names = Array.from(new Set(grid.days.flatMap((d) => d.exercises.map((e) => e.name))));
  const catalog = new Set(CATALOG.map((c) => c.name.toLowerCase()));
  const known = new Set<string>();
  for (const n of names) {
    if (catalog.has(expandShorthand(n).toLowerCase()) || (await findExerciseByName(expandShorthand(n), workspaceId))) known.add(n);
  }
  if (known.size === names.length) return [];
  const library = await prisma.exercise.findMany({ where: visibleTo(workspaceId), select: { id: true, name: true } });
  return suggestMatches(names, library, known);
}
