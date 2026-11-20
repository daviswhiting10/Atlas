import { prisma } from "@/lib/db/client";
import { MovementPattern, type Prisma } from "@/app/generated/prisma/client";
import { cleanName, customSlug } from "./custom";
import { findExerciseByName } from "./find";

type Db = Prisma.TransactionClient | typeof prisma;

export type CustomExercise = { id: string; name: string; slug: string; movementPattern: MovementPattern; equipment: string; created: boolean };

const SELECT = { id: true, name: true, slug: true, movementPattern: true, equipment: true, workspaceId: true, mergedIntoId: true } as const;

/**
 * The one way a typed exercise comes into being (the picker, imports and the quick logger all use it).
 *
 * The exercise the name already means (same name ignoring case, plural and spacing, or an alternate name)
 * is returned as it is. Otherwise a new one is saved in this workspace's own exercises with only a name:
 * no muscles (it is simply unclassified), pattern and equipment guessed from the name. The slug comes from the name, not the
 * time, so a repeated or retried tap lands on the same row. Returns null for a name that isn't usable.
 */
export async function createCustomExercise(workspaceId: string, rawName: unknown, db: Db = prisma): Promise<CustomExercise | null> {
  const name = cleanName(rawName);
  if (!name) return null;

  const same = await findExerciseByName(name, workspaceId, db);
  if (same) {
    const row = await db.exercise.findUnique({ where: { id: same.id }, select: SELECT });
    if (row) return { ...row, created: false };
  }

  const data = {
    name,
    slug: customSlug(workspaceId, name),
    movementPattern: guessPattern(name),
    equipment: guessEquipment(name),
    primaryMuscles: [],
    secondaryMuscles: [],
    instructions: [],
    workspaceId,
  };
  // Upsert on the slug: two taps at once, or a retry after a lost answer, find the first one's row.
  const row = await db.exercise.upsert({ where: { slug: data.slug }, create: data, update: {}, select: SELECT });
  if (row.workspaceId === workspaceId && !row.mergedIntoId) return { ...row, created: true };
  // That slug belongs to something else (a one-in-a-trillion collision, or an exercise since merged away): take a fresh one.
  const fresh = await db.exercise.create({ data: { ...data, slug: `${data.slug}-${Date.now().toString(36)}` }, select: SELECT });
  return { ...fresh, created: true };
}

/** A movement pattern from an exercise's name. It only steers load steps (lower body moves in bigger jumps). */
export function guessPattern(name: string): MovementPattern {
  const n = name.toLowerCase();
  if (/squat|leg press|step.?up/.test(n)) return MovementPattern.SQUAT;
  if (/dead ?lift|rdl|hinge|swing|good morning|hip thrust|bridge/.test(n)) return MovementPattern.HINGE;
  if (/lunge|split/.test(n)) return MovementPattern.LUNGE;
  if (/carry/.test(n)) return MovementPattern.CARRY;
  if (/overhead|shoulder press|military|ohp/.test(n)) return MovementPattern.VERTICAL_PUSH;
  if (/bench|push.?up|chest|press|dip/.test(n)) return MovementPattern.HORIZONTAL_PUSH;
  if (/pull.?up|chin|lat |pulldown|pull-down/.test(n)) return MovementPattern.VERTICAL_PULL;
  if (/row|face pull|pull.?apart/.test(n)) return MovementPattern.HORIZONTAL_PULL;
  if (/plank|pallof|dead ?bug|bird ?dog/.test(n)) return MovementPattern.ANTI_ROTATION;
  if (/twist|chop|rotation/.test(n)) return MovementPattern.ROTATION;
  return MovementPattern.LOCOMOTION;
}

export function guessEquipment(name: string): string {
  const n = name.toLowerCase();
  if (/barbell|\bbb\b/.test(n)) return "barbell";
  if (/dumbbell|\bdb\b/.test(n)) return "dumbbell";
  if (/kettlebell|\bkb\b/.test(n)) return "kettlebell";
  if (/band/.test(n)) return "band";
  if (/cable/.test(n)) return "cable";
  if (/machine|leg press|pulldown/.test(n)) return "machine";
  if (/push.?up|plank|bodyweight|\bbw\b|pull.?up|chin/.test(n)) return "bodyweight";
  return "other";
}
