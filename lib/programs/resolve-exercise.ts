import { prisma } from "@/lib/db/client";
import { CATALOG } from "@/lib/plan/catalog";
import { createCustomExercise } from "@/lib/exercises/create";
import { findExerciseByName, liveExercise, visibleTo } from "@/lib/exercises/find";

/**
 * Match an exercise name from the screenshot to the library: the shared one,
 * or this workspace's own. Anything new is created privately for this
 * workspace, never in the shared library.
 */
export async function resolveExercise(name: string, workspaceId: string): Promise<{ id: string; name: string }> {
  const visible = visibleTo(workspaceId);
  // Coaches' shorthand, spelled out: "DB Bench Press" is the Dumbbell Bench Press.
  name = expandShorthand(name);

  // 1) Atlas's own catalog, by its display name ("Walking Lunge"): the cleanest match there is.
  const fromCatalog = CATALOG.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  if (fromCatalog) {
    const row = await prisma.exercise.findFirst({ where: { slug: fromCatalog.slug, workspaceId: null }, select: { id: true } });
    const ex = row && (await liveExercise(row.id)); // it may have been merged into another
    if (ex) return { id: ex.id, name: ex.name };
  }

  // 2) the exact name, a saved alternate name, or the same name written differently ("1A DB RDL")
  let ex = await findExerciseByName(name, workspaceId);
  if (ex) return ex;

  // 3) a name containing it, only when it's specific enough to be the same exercise: two words or
  //    more, and not much longer ("Seated cable row" → "Seated Cable Rows", but "Hinge" never becomes
  //    "KB Swing (hip hinge explosive)"). Clean names first (no "1A " block labels), then the shortest.
  const words = (s: string) => s.trim().split(/[\s/-]+/).filter(Boolean).length;
  if (words(name) >= 2) {
    const candidates = await prisma.exercise.findMany({
      where: { ...visible, name: { contains: name, mode: "insensitive" } },
      select: { id: true, name: true },
      take: 25,
    });
    const labelled = (n: string) => /^\d+[A-Z]?\s/.test(n);
    ex =
      candidates
        // Not a combined entry ("Band Pull-Apart / Face Pull") unless that's what was asked for.
        .filter((c) => !labelled(c.name) && words(c.name) <= words(name) + 2 && (name.includes("/") || !c.name.includes("/")))
        .sort((a, b) => a.name.length - b.name.length)[0] ?? null;
    if (ex) return ex;
  }

  // 4) create it, private to this workspace (the same path the picker uses)
  const created = await createCustomExercise(workspaceId, name);
  if (!created) throw new Error("That exercise has no name.");
  return { id: created.id, name: created.name };
}

const SHORTHAND: Array<[RegExp, string]> = [
  [/\bDB\b/gi, "Dumbbell"],
  [/\bBB\b/gi, "Barbell"],
  [/\bKB\b/gi, "Kettlebell"],
  [/\bSA\b/gi, "Single-Arm"],
  [/\bSL\b/gi, "Single-Leg"],
  [/\bRDLs?\b/gi, "Romanian Deadlift"],
  [/\bOHP\b/gi, "Overhead Press"],
  [/\bBW\b/gi, "Bodyweight"],
];

/** Common gym shorthand spelled out, so it can match the library. */
export function expandShorthand(name: string): string {
  return SHORTHAND.reduce((n, [re, full]) => n.replace(re, full), name.trim()).replace(/\s+/g, " ");
}

/**
 * Many names at once, the same answers as resolveExercise one by one, in a few queries: Atlas's catalog names in one
 * query and exact names in another (the workspace's own first); only the names neither finds go through the one-by-one
 * path (alternate names, the same name written differently, a near match, or a new exercise). Keys are the names as given.
 */
export async function resolveExercises(names: string[], workspaceId: string): Promise<Map<string, { id: string; name: string }>> {
  const out = new Map<string, { id: string; name: string }>();
  const expanded = new Map(names.map((n) => [n, expandShorthand(n)] as const));
  const lower = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

  // 1) Atlas's catalog by display name: one query for every slug; a merged row (rare) follows its merge.
  const slugOf = new Map<string, string>();
  for (const [n, e] of Array.from(expanded)) {
    const c = CATALOG.find((x) => x.name.toLowerCase() === e.trim().toLowerCase());
    if (c) slugOf.set(n, c.slug);
  }
  if (slugOf.size > 0) {
    const rows = await prisma.exercise.findMany({ where: { slug: { in: Array.from(new Set(slugOf.values())) }, workspaceId: null }, select: { id: true, name: true, slug: true, mergedIntoId: true } });
    for (const [n, slug] of Array.from(slugOf)) {
      const row = rows.find((r) => r.slug === slug);
      if (!row) continue;
      const ex = row.mergedIntoId ? await liveExercise(row.id) : row;
      if (ex) out.set(n, { id: ex.id, name: ex.name });
    }
  }

  // 2) the exact name, case aside: one query; the workspace's own before the shared library (as findExerciseByName).
  const rest = names.filter((n) => !out.has(n) && lower(expanded.get(n)!));
  if (rest.length > 0) {
    const rows = await prisma.exercise.findMany({
      where: { ...visibleTo(workspaceId), name: { in: Array.from(new Set(rest.map((n) => expanded.get(n)!.replace(/\s+/g, " ").trim()))), mode: "insensitive" } },
      select: { id: true, name: true, workspaceId: true },
    });
    for (const n of rest) {
      const want = lower(expanded.get(n)!);
      const hit = rows.filter((r) => r.name.toLowerCase() === want).sort((a, b) => Number(a.workspaceId === null) - Number(b.workspaceId === null))[0];
      if (hit) out.set(n, { id: hit.id, name: hit.name });
    }
  }

  // 3) the rest, one by one (a few at a time), grouped so two names that spell out the same never both create it.
  const groups = new Map<string, string[]>();
  for (const n of names.filter((x) => !out.has(x))) {
    const key = lower(expanded.get(n)!);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const list = Array.from(groups.values());
  for (let i = 0; i < list.length; i += 6) {
    const batch = list.slice(i, i + 6);
    const found = await Promise.all(batch.map((g) => resolveExercise(g[0], workspaceId)));
    batch.forEach((g, j) => g.forEach((n) => out.set(n, found[j])));
  }
  return out;
}

