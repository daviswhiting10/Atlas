/**
 * Undo an exercise-cleanup batch, newest change first.
 *
 *   npx tsx scripts/exercise-cleanup/undo.ts <batch-id> [--only <exercise-id>] [--dry-run]
 *
 * --only reverses just the changes to one exercise (for example one merge).
 * A merge is undone by moving back exactly the rows it moved. Rows created
 * since (a set logged against the survivor afterwards) stay where they are.
 * Refuses production unless ALLOW_PROD=1.
 */
import { prisma } from "@/lib/db/client";
import { isProductionDatabase } from "@/lib/db/production";

const batch = process.argv[2];
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt > 0 ? process.argv[onlyAt + 1] : null;
const dryRun = process.argv.includes("--dry-run");
if (!batch || batch.startsWith("--")) throw new Error("Usage: undo.ts <batch-id> [--only <exercise-id>] [--dry-run]");
if (isProductionDatabase(process.env.DATABASE_URL) && process.env.ALLOW_PROD !== "1") throw new Error("That is production — refusing to run without ALLOW_PROD=1");

type Moved = Record<"SetLog" | "WorkoutExercise" | "AssignedWorkoutExercise" | "ExerciseCoachNote" | "Milestone" | "ExerciseMedia" | "ExerciseAlias" | "keyLifts", string[]>;
class DryRun extends Error {}

async function main() {
  const changes = await prisma.exerciseChange.findMany({
    where: { batch, reversedAt: null, ...(only && { exerciseId: only }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (changes.length === 0) throw new Error(`Nothing to undo in batch ${batch}${only ? ` for ${only}` : ""}`);
  const done: Record<string, number> = {};

  await prisma
    .$transaction(
      async (tx) => {
        for (const c of changes) {
          const before = c.before as Record<string, unknown>;
          const after = c.after as Record<string, unknown>;
          if (c.kind === "scope") {
            await tx.exercise.update({ where: { id: c.exerciseId }, data: { workspaceId: null } });
            await tx.exerciseAlias.updateMany({ where: { id: { in: (after.aliasIds as string[]) ?? [] } }, data: { workspaceId: null } });
          } else if (c.kind === "rename") {
            await tx.exercise.update({ where: { id: c.exerciseId }, data: { name: before.name as string } });
            await tx.exerciseAlias.deleteMany({ where: { id: after.aliasId as string } });
          } else if (c.kind === "merge") {
            const moved = c.moved as Moved;
            const back = { exerciseId: c.exerciseId };
            const from = { exerciseId: c.intoId! };
            await tx.setLog.updateMany({ where: { id: { in: moved.SetLog }, ...from }, data: back });
            await tx.workoutExercise.updateMany({ where: { id: { in: moved.WorkoutExercise }, ...from }, data: back });
            await tx.assignedWorkoutExercise.updateMany({ where: { id: { in: moved.AssignedWorkoutExercise }, ...from }, data: back });
            await tx.exerciseCoachNote.updateMany({ where: { id: { in: moved.ExerciseCoachNote }, ...from }, data: back });
            await tx.milestone.updateMany({ where: { id: { in: moved.Milestone }, ...from }, data: back });
            await tx.exerciseMedia.updateMany({ where: { id: { in: moved.ExerciseMedia }, ...from }, data: back });
            await tx.exerciseAlias.updateMany({ where: { id: { in: moved.ExerciseAlias }, ...from }, data: back });
            for (const clientId of moved.keyLifts) {
              const p = await tx.clientProfile.findUniqueOrThrow({ where: { id: clientId }, select: { keyLiftIds: true } });
              const next = p.keyLiftIds.includes(c.exerciseId) ? p.keyLiftIds : p.keyLiftIds.map((x) => (x === c.intoId ? c.exerciseId : x));
              await tx.clientProfile.update({ where: { id: clientId }, data: { keyLiftIds: next } });
            }
            await tx.exerciseAlias.deleteMany({ where: { id: after.aliasId as string } });
            await tx.exercise.update({ where: { id: c.exerciseId }, data: { mergedIntoId: null } });
          } else if (c.kind === "muscles") {
            await tx.exercise.update({ where: { id: c.exerciseId }, data: { primaryMuscles: before.primaryMuscles as string[], secondaryMuscles: before.secondaryMuscles as string[] } });
          } else if (c.kind === "alias") {
            await tx.exerciseAlias.deleteMany({ where: { id: after.aliasId as string } });
          } else if (c.kind === "picture") {
            await tx.exercise.updateMany({ where: { id: c.exerciseId, gifUrl: after.gifUrl as string }, data: { gifUrl: (before.gifUrl as string | null) ?? null } });
          } else {
            throw new Error(`Don't know how to undo a "${c.kind}" change`);
          }
          await tx.exerciseChange.update({ where: { id: c.id }, data: { reversedAt: new Date() } });
          done[c.kind] = (done[c.kind] ?? 0) + 1;
        }
        if (dryRun) throw new DryRun();
      },
      { timeout: 600_000, maxWait: 20_000 }
    )
    .catch((err) => {
      if (!(err instanceof DryRun)) throw err;
    });
  console.log(JSON.stringify({ batch, only, dryRun, undone: done }, null, 1));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
