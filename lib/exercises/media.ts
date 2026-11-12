/**
 * A coach's own photo or short clip of an exercise, kept in Vercel Blob
 * (public store) and recorded in ExerciseMedia: one per exercise per coach.
 * It's shown in place of the library picture, to that coach and their
 * clients only.
 *
 * Files never outlive their row: replacing or removing an upload deletes the
 * old file, deleteExercise() deletes files before the exercise, and
 * sweepOrphans() deletes anything in a coach's folder that no row points at
 * (for rows removed some other way, such as a database cascade).
 */

import { del, head, list } from "@vercel/blob";
import { prisma } from "@/lib/db/client";
import type { Picture } from "./pictures";

/** Small on purpose: storage cost stays negligible. */
export const LIMITS = {
  imageBytes: 2 * 1024 * 1024,
  videoBytes: 20 * 1024 * 1024,
  videoSeconds: 15,
};
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export type MediaKind = "image" | "video";

/** Every coach's files live under their own folder. */
export const folderFor = (workspaceId: string) => `exercise-media/${workspaceId}/`;

export const blobConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/** The coach's uploads for these exercises, as pictures. */
export async function mediaPictures(workspaceId: string, exerciseIds: string[]): Promise<Map<string, Picture>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await prisma.exerciseMedia.findMany({
    where: { workspaceId, exerciseId: { in: Array.from(new Set(exerciseIds)) } },
    select: { exerciseId: true, url: true, kind: true, exercise: { select: { name: true } } },
  });
  return new Map(
    rows.map((r) => [r.exerciseId, r.kind === "video" ? { name: r.exercise.name, frames: [], video: r.url, own: true } : { name: r.exercise.name, frames: [r.url], own: true }])
  );
}

/** Delete files, quietly: a file that's already gone is fine. */
async function deleteFiles(urls: string[]) {
  if (urls.length === 0 || !blobConfigured()) return;
  try {
    await del(urls);
  } catch (err) {
    console.error("[exercise media] couldn't delete", urls.length, "file(s)", err);
  }
}

/**
 * Record a finished upload, replacing (and deleting) any earlier one for the
 * same exercise. The file is checked on the server: it must be in this
 * coach's folder, and its real size and type within the limits.
 */
export async function saveMedia(workspaceId: string, exerciseId: string, url: string): Promise<{ kind: MediaKind }> {
  const meta = await head(url);
  if (!meta.pathname.startsWith(folderFor(workspaceId))) throw new Error("That file isn't one of yours.");
  const kind: MediaKind | null = IMAGE_TYPES.includes(meta.contentType) ? "image" : VIDEO_TYPES.includes(meta.contentType) ? "video" : null;
  const limit = kind === "video" ? LIMITS.videoBytes : LIMITS.imageBytes;
  if (!kind || meta.size > limit) {
    await deleteFiles([meta.url]);
    throw new Error(kind ? "That file is too big." : "Use a photo (JPG, PNG, WebP) or a short video (MP4, MOV, WebM).");
  }

  const oldUrl = (await prisma.exerciseMedia.findUnique({ where: { workspaceId_exerciseId: { workspaceId, exerciseId } }, select: { url: true } }))?.url ?? null;
  await prisma.exerciseMedia.upsert({
    where: { workspaceId_exerciseId: { workspaceId, exerciseId } },
    create: { workspaceId, exerciseId, url: meta.url, kind, sizeBytes: meta.size },
    update: { url: meta.url, kind, sizeBytes: meta.size, createdAt: new Date() },
  });
  if (oldUrl && oldUrl !== meta.url) await deleteFiles([oldUrl]);
  await sweepOrphans(workspaceId);
  return { kind };
}

/** Take a coach's upload off an exercise, and delete the file. */
export async function removeMedia(workspaceId: string, exerciseId: string): Promise<void> {
  const row = await prisma.exerciseMedia.findUnique({ where: { workspaceId_exerciseId: { workspaceId, exerciseId } }, select: { id: true, url: true } });
  if (!row) return;
  await prisma.exerciseMedia.delete({ where: { id: row.id } });
  await deleteFiles([row.url]);
}

/** Delete an exercise. Anything that removes exercises must come through here, so their files go too. */
export async function deleteExercise(exerciseId: string): Promise<void> {
  const files = await prisma.exerciseMedia.findMany({ where: { exerciseId }, select: { url: true } });
  await prisma.exercise.delete({ where: { id: exerciseId } });
  await deleteFiles(files.map((f) => f.url));
}

/** Delete files in a coach's folder that no upload row points at (and that are over an hour old). */
export async function sweepOrphans(workspaceId: string): Promise<number> {
  if (!blobConfigured()) return 0;
  try {
    const kept = new Set((await prisma.exerciseMedia.findMany({ where: { workspaceId }, select: { url: true } })).map((r) => r.url));
    const stray: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: folderFor(workspaceId), cursor, limit: 1000 });
      // Over an hour old: never a file that's still on its way to being saved.
      for (const b of page.blobs) if (!kept.has(b.url) && Date.now() - new Date(b.uploadedAt).getTime() > 60 * 60 * 1000) stray.push(b.url);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    await deleteFiles(stray);
    return stray.length;
  } catch (err) {
    console.error("[exercise media] sweep failed", err);
    return 0;
  }
}
