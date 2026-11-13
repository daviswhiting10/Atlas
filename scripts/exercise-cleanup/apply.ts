/**
 * Exercise library cleanup (step 4): apply the approved plan as one batch.
 *
 *   npx tsx scripts/exercise-cleanup/apply.ts <batch-id> [--dry-run]
 *
 * In order, all in one transaction:
 *   1. picture  Store the picture each renamed exercise shows today, so the rename can't change it.
 *   2. merge    Move every row that points at a duplicate (sets, plan exercises, client plan
 *               exercises, coach notes, milestones, media, key lifts) to the survivor, and mark
 *               the duplicate merged. Nothing is deleted; its old name is kept as an alternate name.
 *   3. rename   Give each exercise its one name; the old name is kept as an alternate name.
 *   4. scope    Move names created by imports or typing out of the shared library into the
 *               workspace that uses them, skipping any another workspace uses.
 *   5. muscles  The hand-checked list (muscles.json) first; then, for exercises with no muscles,
 *               the free-exercise-db entry their name matches (matched on the name before renames).
 *
 * Every change is written to ExerciseChange with what undo.ts needs to reverse it.
 * Refuses production unless ALLOW_PROD=1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/client";
import { isProductionDatabase } from "@/lib/db/production";
import { Prisma } from "@/app/generated/prisma/client";
import { _match, libraryPictureUrl } from "@/lib/exercises/pictures";
import { GROUP_WORD, type ExerciseGroup } from "@/lib/exercises/muscles";
import { nameKey } from "@/lib/exercises/names";

type Plan = {
  merges: Array<{ into: { id: string; name: string }; from: Array<{ id: string; name: string; workspaceId: string | null }> }>;
  renames: Array<{ id: string; from: string; to: string }>;
  /** Extra alternate names: what screens showed before a name was settled ("Cable Fly"). */
  aliases: Array<{ id: string; exercise: string; name: string }>;
  /** The only workspace imported names move into; any other (test data included) is left alone. */
  scopeInto: string;
};

const batch = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!batch || batch.startsWith("--")) throw new Error("Usage: apply.ts <batch-id> [--dry-run]");
if (isProductionDatabase(process.env.DATABASE_URL) && process.env.ALLOW_PROD !== "1") throw new Error("That is production — refusing to run without ALLOW_PROD=1");

const plan: Plan = JSON.parse(readFileSync(join(__dirname, "plan.json"), "utf8"));
/** Muscle groups checked by the coach: exercises the library doesn't know, and corrections to it. */
const handMuscles: Array<{ id: string; name: string; group: ExerciseGroup }> = JSON.parse(readFileSync(join(__dirname, "muscles.json"), "utf8"));
type RawEntry = { name: string; primaryMuscles: string[]; secondaryMuscles: string[] };
const freeDb = new Map((JSON.parse(readFileSync(join(__dirname, "../../data/exercise-db-raw.json"), "utf8")) as RawEntry[]).map((e) => [e.name, e]));
const BY = "cleanup:step4";
/** Global exercises created by an import or by typing carry a timestamp in their slug. */
const IMPORTED_SLUG = /-\d{13}$/;

class DryRun extends Error {}

async function main() {
  const already = await prisma.exerciseChange.count({ where: { batch } });
  if (already > 0) throw new Error(`Batch ${batch} has already been applied (${already} changes)`);

  const summary = { muscles: 0, musclesFromLibrary: 0, pictures: 0, picturesNone: [] as string[], merged: 0, moved: {} as Record<string, number>, renamed: 0, scoped: 0, scopeSkippedShared: 0, scopeSkippedUnused: 0, scopeSkippedOtherWorkspace: 0 };
  const bump = (t: string, n: number) => (summary.moved[t] = (summary.moved[t] ?? 0) + n);

  await prisma
    .$transaction(
      async (tx) => {
        const log = (kind: string, exerciseId: string, before: object, after: object, extra: { intoId?: string; moved?: object } = {}) =>
          tx.exerciseChange.create({ data: { batch, kind, exerciseId, before, after, by: BY, intoId: extra.intoId, moved: extra.moved as Prisma.InputJsonValue } });

        // Library matches for muscles, on today's names (before any rename).
        const matchedBefore = new Map((await tx.exercise.findMany({ select: { id: true, name: true } })).map((e) => [e.id, _match(e.name)]));

        // 1. Pictures, before any name changes.
        for (const r of plan.renames) {
          const ex = await tx.exercise.findUniqueOrThrow({ where: { id: r.id }, select: { name: true, gifUrl: true } });
          if (ex.name !== r.from) throw new Error(`Expected "${r.from}", found "${ex.name}" (${r.id})`);
          if (ex.gifUrl) continue; // already stored
          const url = libraryPictureUrl(ex.name);
          if (!url) {
            summary.picturesNone.push(ex.name);
            continue;
          }
          await tx.exercise.update({ where: { id: r.id }, data: { gifUrl: url } });
          await log("picture", r.id, { gifUrl: null }, { gifUrl: url });
          summary.pictures++;
        }

        // 2. Merges.
        for (const m of plan.merges) {
          const into = await tx.exercise.findUniqueOrThrow({ where: { id: m.into.id }, select: { id: true, name: true, workspaceId: true, mergedIntoId: true } });
          if (into.name !== m.into.name || into.mergedIntoId) throw new Error(`Survivor changed: "${m.into.name}" (${into.id})`);
          for (const f of m.from) {
            const from = await tx.exercise.findUniqueOrThrow({ where: { id: f.id }, select: { id: true, name: true, workspaceId: true, mergedIntoId: true } });
            if (from.name !== f.name || from.mergedIntoId || from.workspaceId !== f.workspaceId) throw new Error(`Duplicate changed: "${f.name}" (${f.id})`);
            // Never across workspaces: a private exercise only joins its own workspace's or a shared one.
            if (into.workspaceId !== null && into.workspaceId !== from.workspaceId) throw new Error(`Cross-workspace merge refused: "${f.name}" → "${into.name}"`);

            const ids = async (rows: Promise<Array<{ id: string }>>) => (await rows).map((r) => r.id);
            const where = { exerciseId: from.id };
            const moved = {
              SetLog: await ids(tx.setLog.findMany({ where, select: { id: true } })),
              WorkoutExercise: await ids(tx.workoutExercise.findMany({ where, select: { id: true } })),
              AssignedWorkoutExercise: await ids(tx.assignedWorkoutExercise.findMany({ where, select: { id: true } })),
              ExerciseCoachNote: await ids(tx.exerciseCoachNote.findMany({ where, select: { id: true } })),
              Milestone: await ids(tx.milestone.findMany({ where, select: { id: true } })),
              ExerciseMedia: [] as string[],
              ExerciseAlias: await ids(tx.exerciseAlias.findMany({ where, select: { id: true } })),
              keyLifts: await ids(tx.clientProfile.findMany({ where: { keyLiftIds: { has: from.id } }, select: { id: true } })),
            };
            // A coach's own picture or video moves too, unless the survivor already has one for that workspace.
            for (const media of await tx.exerciseMedia.findMany({ where, select: { id: true, workspaceId: true } })) {
              const taken = await tx.exerciseMedia.findFirst({ where: { exerciseId: into.id, workspaceId: media.workspaceId }, select: { id: true } });
              if (!taken) moved.ExerciseMedia.push(media.id);
            }

            const to = { exerciseId: into.id };
            await tx.setLog.updateMany({ where: { id: { in: moved.SetLog } }, data: to });
            await tx.workoutExercise.updateMany({ where: { id: { in: moved.WorkoutExercise } }, data: to });
            await tx.assignedWorkoutExercise.updateMany({ where: { id: { in: moved.AssignedWorkoutExercise } }, data: to });
            await tx.exerciseCoachNote.updateMany({ where: { id: { in: moved.ExerciseCoachNote } }, data: to });
            await tx.milestone.updateMany({ where: { id: { in: moved.Milestone } }, data: to });
            await tx.exerciseMedia.updateMany({ where: { id: { in: moved.ExerciseMedia } }, data: to });
            await tx.exerciseAlias.updateMany({ where: { id: { in: moved.ExerciseAlias } }, data: to });
            for (const clientId of moved.keyLifts) {
              const c = await tx.clientProfile.findUniqueOrThrow({ where: { id: clientId }, select: { keyLiftIds: true } });
              const next = Array.from(new Set(c.keyLiftIds.map((x) => (x === from.id ? into.id : x))));
              await tx.clientProfile.update({ where: { id: clientId }, data: { keyLiftIds: next } });
            }
            for (const [t, list] of Object.entries(moved)) bump(t, list.length);

            await tx.exercise.update({ where: { id: from.id }, data: { mergedIntoId: into.id } });
            // The old name keeps working: "db rdl" still finds Dumbbell Romanian Deadlift.
            const alias = await tx.exerciseAlias.create({
              data: { exerciseId: into.id, workspaceId: from.workspaceId, name: from.name, key: nameKey(from.name), source: "merge" },
              select: { id: true },
            });
            await log("merge", from.id, { mergedIntoId: null }, { mergedIntoId: into.id, aliasId: alias.id }, { intoId: into.id, moved });
            summary.merged++;
          }
        }

        // 3. Renames.
        for (const r of plan.renames) {
          const ex = await tx.exercise.findUniqueOrThrow({ where: { id: r.id }, select: { name: true, workspaceId: true } });
          if (ex.name !== r.from) throw new Error(`Expected "${r.from}", found "${ex.name}" (${r.id})`);
          await tx.exercise.update({ where: { id: r.id }, data: { name: r.to } });
          const alias = await tx.exerciseAlias.create({
            data: { exerciseId: r.id, workspaceId: ex.workspaceId, name: r.from, key: nameKey(r.from), source: "rename" },
            select: { id: true },
          });
          await log("rename", r.id, { name: r.from }, { name: r.to, aliasId: alias.id });
          summary.renamed++;
        }

        // Extra alternate names.
        for (const a of plan.aliases) {
          const ex = await tx.exercise.findUniqueOrThrow({ where: { id: a.id }, select: { name: true, workspaceId: true } });
          if (ex.name !== a.exercise) throw new Error(`Expected "${a.exercise}", found "${ex.name}" (${a.id})`);
          const alias = await tx.exerciseAlias.create({ data: { exerciseId: a.id, workspaceId: ex.workspaceId, name: a.name, key: nameKey(a.name), source: "rename" }, select: { id: true } });
          await log("alias", a.id, {}, { aliasId: alias.id, name: a.name });
        }

        // 4. Imported names out of the shared library, into the one workspace that uses them.
        const candidates = await tx.exercise.findMany({ where: { workspaceId: null, mergedIntoId: null }, select: { id: true, slug: true, name: true } });
        for (const ex of candidates.filter((e) => IMPORTED_SLUG.test(e.slug))) {
          const users = await tx.$queryRaw<Array<{ ws: string }>>(Prisma.sql`
            select distinct ws from (
              select cp."workspaceId" ws from "SetLog" s join "WorkoutLog" l on l.id = s."workoutLogId" join "ClientProfile" cp on cp.id = l."clientId" where s."exerciseId" = ${ex.id}
              union select "workspaceId" from "WorkoutExercise" where "exerciseId" = ${ex.id}
              union select "workspaceId" from "AssignedWorkoutExercise" where "exerciseId" = ${ex.id}
              union select cp."workspaceId" from "ExerciseCoachNote" n join "ClientProfile" cp on cp.id = n."clientId" where n."exerciseId" = ${ex.id}
              union select "workspaceId" from "Milestone" where "exerciseId" = ${ex.id}
              union select "workspaceId" from "ExerciseMedia" where "exerciseId" = ${ex.id}
              union select "workspaceId" from "ClientProfile" where ${ex.id} = any("keyLiftIds")
            ) u where ws is not null`);
          if (users.length === 0) {
            summary.scopeSkippedUnused++;
            continue;
          }
          if (users.length > 1) {
            summary.scopeSkippedShared++;
            continue;
          }
          const ws = users[0].ws;
          if (ws !== plan.scopeInto) {
            summary.scopeSkippedOtherWorkspace++;
            continue;
          }
          await tx.exercise.update({ where: { id: ex.id }, data: { workspaceId: ws } });
          // Its alternate names go with it.
          const aliases = await tx.exerciseAlias.findMany({ where: { exerciseId: ex.id, workspaceId: null }, select: { id: true } });
          await tx.exerciseAlias.updateMany({ where: { id: { in: aliases.map((a) => a.id) } }, data: { workspaceId: ws } });
          await log("scope", ex.id, { workspaceId: null }, { workspaceId: ws, aliasIds: aliases.map((a) => a.id) });
          summary.scoped++;
        }

        // 5. Muscles. Only exercises still shown, in the shared library or the workspace being cleaned up.
        const setMuscles = async (id: string, primary: string[], secondary: string[], source: string) => {
          const ex = await tx.exercise.findUniqueOrThrow({ where: { id }, select: { primaryMuscles: true, secondaryMuscles: true } });
          await tx.exercise.update({ where: { id }, data: { primaryMuscles: primary, secondaryMuscles: secondary } });
          await log("muscles", id, { primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles }, { primaryMuscles: primary, secondaryMuscles: secondary, source });
        };
        for (const h of handMuscles) {
          const ex = await tx.exercise.findUniqueOrThrow({ where: { id: h.id }, select: { name: true, mergedIntoId: true } });
          if (ex.mergedIntoId) continue; // its sets now count under the survivor
          if (ex.name !== h.name) throw new Error(`Expected "${h.name}", found "${ex.name}" (${h.id})`);
          await setMuscles(h.id, [GROUP_WORD[h.group]], [], "checked by coach");
          summary.muscles++;
        }
        const empty = await tx.exercise.findMany({
          where: { mergedIntoId: null, OR: [{ workspaceId: null }, { workspaceId: plan.scopeInto }] },
          select: { id: true, primaryMuscles: true },
        });
        for (const ex of empty.filter((e) => !Array.isArray(e.primaryMuscles) || e.primaryMuscles.length === 0)) {
          const entry = freeDb.get(matchedBefore.get(ex.id) ?? "");
          if (!entry || entry.primaryMuscles.length === 0) continue;
          await setMuscles(ex.id, entry.primaryMuscles, entry.secondaryMuscles, `free-exercise-db: ${entry.name}`);
          summary.musclesFromLibrary++;
        }

        if (dryRun) throw new DryRun();
      },
      { timeout: 600_000, maxWait: 20_000 }
    )
    .catch((err) => {
      if (!(err instanceof DryRun)) throw err;
    });

  console.log(JSON.stringify({ batch, dryRun, ...summary }, null, 1));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
