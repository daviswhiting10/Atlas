import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { hasBlockLabel, nameKey } from "./names";

type Db = Prisma.TransactionClient | typeof prisma;
type Found = { id: string; name: string };

/** Exercises a workspace can use: the shared library and its own, never a merged-away one. */
export const visibleTo = (workspaceId: string | null): Prisma.ExerciseWhereInput => ({
  mergedIntoId: null,
  OR: [{ workspaceId: null }, ...(workspaceId ? [{ workspaceId }] : [])],
});

/**
 * The exercise a typed or imported name means, or null if it's new.
 *
 * 1. The exact name.
 * 2. A name saved for it: an old name kept after a merge or rename, or a match the coach confirmed.
 * 3. The same name written differently: shorthand, block labels, plurals, hyphens ("1A DB RDL").
 *
 * Close-but-different names are never linked here; screens offer them for the person to pick.
 */
export async function findExerciseByName(name: string, workspaceId: string | null, db: Db = prisma): Promise<Found | null> {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return null;

  const exact = await db.exercise.findFirst({
    where: { ...visibleTo(workspaceId), name: { equals: clean, mode: "insensitive" } },
    orderBy: { workspaceId: { sort: "desc", nulls: "last" } }, // the workspace's own first
    select: { id: true, name: true },
  });
  if (exact) return exact;

  const key = nameKey(clean);
  if (!key) return null;

  const aliases = await db.exerciseAlias.findMany({
    where: { key, OR: [{ workspaceId: null }, ...(workspaceId ? [{ workspaceId }] : [])] },
    orderBy: { workspaceId: { sort: "desc", nulls: "last" } },
    select: { exerciseId: true },
  });
  for (const a of aliases) {
    const ex = await liveExercise(a.exerciseId, db);
    if (ex && (ex.workspaceId === null || ex.workspaceId === workspaceId)) return { id: ex.id, name: ex.name };
  }

  const all = await db.exercise.findMany({ where: visibleTo(workspaceId), select: { id: true, name: true, workspaceId: true } });
  const same = all
    .filter((e) => nameKey(e.name) === key)
    // Clean names before spreadsheet-labelled copies, the workspace's own before shared, then the shortest.
    .sort((a, b) => Number(hasBlockLabel(a.name)) - Number(hasBlockLabel(b.name)) || Number(a.workspaceId === null) - Number(b.workspaceId === null) || a.name.length - b.name.length);
  return same[0] ? { id: same[0].id, name: same[0].name } : null;
}

/** The exercise an id now stands for: itself, or what it was merged into. */
export async function liveExercise(id: string, db: Db = prisma) {
  let ex = await db.exercise.findUnique({ where: { id }, select: { id: true, name: true, slug: true, workspaceId: true, mergedIntoId: true } });
  for (let hops = 0; ex?.mergedIntoId && hops < 5; hops++) {
    ex = await db.exercise.findUnique({ where: { id: ex.mergedIntoId }, select: { id: true, name: true, slug: true, workspaceId: true, mergedIntoId: true } });
  }
  return ex;
}
