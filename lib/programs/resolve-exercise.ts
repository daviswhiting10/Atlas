import { prisma } from "@/lib/db/client";
import { MovementPattern } from "@/app/generated/prisma/client";
import { CATALOG } from "@/lib/plan/catalog";

/**
 * Match an exercise name from the screenshot to the library: the shared one,
 * or this workspace's own. Anything new is created privately for this
 * workspace, never in the shared library.
 */
export async function resolveExercise(name: string, workspaceId: string): Promise<{ id: string; name: string }> {
  const visible = { OR: [{ workspaceId: null }, { workspaceId }] };
  // Coaches' shorthand, spelled out: "DB Bench Press" is the Dumbbell Bench Press.
  name = expandShorthand(name);

  // 1) Atlas's own catalog, by its display name ("Walking Lunge"): the cleanest match there is.
  const fromCatalog = CATALOG.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  if (fromCatalog) {
    const ex = await prisma.exercise.findFirst({ where: { slug: fromCatalog.slug, workspaceId: null }, select: { id: true, name: true } });
    if (ex) return ex;
  }

  // 2) exact name match
  let ex = await prisma.exercise.findFirst({
    where: { ...visible, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
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

  // 4) create it, private to this workspace
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
    "-" +
    Date.now();
  return prisma.exercise.create({
    data: {
      name,
      slug,
      movementPattern: MovementPattern.LOCOMOTION, // placeholder
      equipment: "other",
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      workspaceId,
    },
    select: { id: true, name: true },
  });
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
