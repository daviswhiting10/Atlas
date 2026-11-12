"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { blobConfigured, removeMedia, saveMedia } from "@/lib/exercises/media";

type Result = { ok: true } | { ok: false; error: string };

/** A coach, and an exercise their workspace can see. */
async function scope(exerciseId: string) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!session?.user?.id || !workspaceId || session.user.role === "CLIENT") throw new Error("Only a coach can change exercise pictures.");
  const ex = await prisma.exercise.findFirst({ where: { id: exerciseId, OR: [{ workspaceId: null }, { workspaceId }] }, select: { id: true } });
  if (!ex) throw new Error("That exercise couldn't be found.");
  return { workspaceId };
}

const Id = z.string().min(1).max(64);

function done() {
  // Logger, plans and the client's screens all show the picture.
  revalidatePath("/", "layout");
}

export async function saveExerciseMedia(raw: { exerciseId: string; url: string }): Promise<Result> {
  try {
    if (!blobConfigured()) return { ok: false, error: "Uploads aren't set up yet." };
    const input = z.object({ exerciseId: Id, url: z.string().url().max(500) }).parse(raw);
    const { workspaceId } = await scope(input.exerciseId);
    await saveMedia(workspaceId, input.exerciseId, input.url);
    done();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save that upload." };
  }
}

export async function removeExerciseMedia(raw: { exerciseId: string }): Promise<Result> {
  try {
    const input = z.object({ exerciseId: Id }).parse(raw);
    const { workspaceId } = await scope(input.exerciseId);
    await removeMedia(workspaceId, input.exerciseId);
    done();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't remove that upload." };
  }
}
