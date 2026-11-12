import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { displayName } from "@/lib/plan/catalog";
import { pictureFor } from "@/lib/exercises/pictures";
import { blobConfigured, mediaPictures, sameName } from "@/lib/exercises/media";
import { ExerciseLibrary, type LibraryRow } from "@/components/coach/ExerciseLibrary";

export const metadata: Metadata = { title: "Exercises" };

/**
 * Every exercise the coach can use, with its picture: theirs if they've added
 * one, else the library's. Each can be given a photo or clip that stays with
 * the exercise everywhere it's used.
 */
export default async function ExercisesPage() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId || session.user.role === "CLIENT") redirect("/login");

  const [exercises, assigned, templated] = await Promise.all([
    prisma.exercise.findMany({ where: { OR: [{ workspaceId: null }, { workspaceId }] }, select: { id: true, name: true, slug: true, gifUrl: true } }),
    prisma.assignedWorkoutExercise.findMany({ where: { workspaceId }, distinct: ["exerciseId"], select: { exerciseId: true } }),
    prisma.workoutExercise.findMany({ where: { workspaceId }, distinct: ["exerciseId"], select: { exerciseId: true } }),
  ]);
  const used = new Set([...assigned, ...templated].map((r) => r.exerciseId));
  const own = await mediaPictures(workspaceId, exercises.map((e) => ({ exerciseId: e.id, name: e.name })));

  // One row per name: a photo covers every exercise of that name anyway.
  const byName = new Map<string, LibraryRow>();
  for (const e of exercises) {
    const name = displayName(e.slug, e.name);
    const row: LibraryRow = { id: e.id, name, picture: own.get(e.id) ?? pictureFor({ name, gifUrl: e.gifUrl }), inPlans: used.has(e.id) };
    const key = sameName(e.name);
    const prev = byName.get(key);
    if (!prev || (row.inPlans && !prev.inPlans)) byName.set(key, { ...row, inPlans: row.inPlans || !!prev?.inPlans });
    else if (row.inPlans) prev.inPlans = true;
  }
  const rows = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-8">
      <div className="rise">
        <h1 className="text-4xl leading-none text-ink">Exercises</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">Add your own photo or short clip to any exercise. It stays with that exercise everywhere, for you and your clients.</p>
      </div>
      <ExerciseLibrary rows={rows} workspaceId={workspaceId} uploadsEnabled={blobConfigured()} />
    </div>
  );
}
