"use server";

/**
 * The exercise picker's two calls, for everyone who has one: a coach, an athlete, a guest. Each works inside
 * the caller's own workspace and nowhere else.
 */

import { auth } from "@/lib/auth";
import { athleteIdentity } from "@/lib/athlete/identity";
import { prisma } from "@/lib/db/client";
import { visibleTo } from "@/lib/exercises/find";
import { createCustomExercise } from "@/lib/exercises/create";
import { cleanName } from "@/lib/exercises/custom";
import { ensureCatalog } from "@/lib/plan/persist";

export type PickerExercise = {
  id: string;
  name: string;
  slug: string;
  movementPattern: string;
  equipment: string;
  muscles: string[];
  /** One of this workspace's own, typed in rather than from the shared library. */
  custom: boolean;
};

/** A workspace keeps at most this many exercises of its own. */
const MAX_CUSTOM = 300;

async function workspaceId(): Promise<string | null> {
  const user = (await auth())?.user;
  if (!user?.id) return null;
  return user.workspaceId ?? (await athleteIdentity(user))?.workspaceId ?? null;
}

const muscles = (v: unknown) => (Array.isArray(v) ? v.filter((m): m is string => typeof m === "string") : []);

const toPicker = (e: { id: string; name: string; slug: string; movementPattern: string; equipment: string; primaryMuscles?: unknown; workspaceId: string | null }): PickerExercise => ({
  id: e.id,
  name: e.name,
  slug: e.slug,
  movementPattern: e.movementPattern,
  equipment: e.equipment,
  muscles: muscles(e.primaryMuscles),
  custom: e.workspaceId != null,
});

/** Every exercise this person can pick: the shared library and their workspace's own. The picker filters it as they type. */
export async function listExercises(): Promise<PickerExercise[]> {
  const ws = await workspaceId();
  if (!ws) return [];
  await ensureCatalog(); // Atlas's own exercises are rows too, so the picker can offer them all
  const rows = await prisma.exercise.findMany({
    where: visibleTo(ws),
    select: { id: true, name: true, slug: true, movementPattern: true, equipment: true, primaryMuscles: true, workspaceId: true },
    orderBy: { name: "asc" },
  });
  return rows.map(toPicker);
}

export type CreateResult = { ok: true; exercise: PickerExercise; created: boolean } | { ok: false; error: string };

/** Make a typed exercise, or hand back the one that name already is. Tapping twice, or retrying, makes one. */
export async function createExercise(name: string): Promise<CreateResult> {
  const ws = await workspaceId();
  if (!ws) return { ok: false, error: "Sign in again to add an exercise." };
  if (!cleanName(name)) return { ok: false, error: "Type a name for the exercise." };
  try {
    const mine = await prisma.exercise.count({ where: { workspaceId: ws, mergedIntoId: null } });
    const exercise = mine >= MAX_CUSTOM ? null : await createCustomExercise(ws, name);
    if (!exercise) return { ok: false, error: mine >= MAX_CUSTOM ? "That's a lot of custom exercises. Pick one you already have." : "Type a name for the exercise." };
    return { ok: true, exercise: toPicker({ ...exercise, workspaceId: ws }), created: exercise.created };
  } catch (err) {
    console.error("[create exercise]", err);
    return { ok: false, error: "Couldn't add that exercise. Please try again." };
  }
}
