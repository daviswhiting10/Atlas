/**
 * Many exercise names at once give the same answers as one by one, in fewer queries.
 *
 * Dev database only:  set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/programs/resolve-exercises.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("resolveExercises (batched)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ws = (await prisma.workspace.create({ data: { name: "resolve batch test" }, select: { id: true } })).id;
    await prisma.user.create({ data: { email: `${Date.now().toString(36)}-resolve@guest.atlas.app`, role: "CLIENT", workspaceId: ws } });
    // A name only this workspace has (found by its exact name, case aside).
    await prisma.exercise.create({ data: { workspaceId: ws, name: "Qqx Sled Drag", slug: `qqx-sled-drag-${Date.now().toString(36)}`, movementPattern: "HORIZONTAL_PULL", equipment: "CABLE", primaryMuscles: [], secondaryMuscles: [], instructions: [] } });
  }, 60_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("matches one by one for catalog names, case, shorthand, a workspace's own name, and new names", async () => {
    const { resolveExercise, resolveExercises } = await import("./resolve-exercise");
    const names = ["Back Squat", "barbell bench press", "DB Curl", "Dumbbell Curl", "face pull", "qqx sled drag", "Zzq Banded Thing"];
    const batch = await resolveExercises(names, ws);
    expect(Array.from(batch.keys()).sort()).toEqual([...names].sort());
    for (const n of names) expect(batch.get(n)!.id, n).toBe((await resolveExercise(n, ws)).id);
    expect(batch.get("DB Curl")!.id).toBe(batch.get("Dumbbell Curl")!.id);
    const own = await prisma.exercise.findFirstOrThrow({ where: { workspaceId: ws, name: "Qqx Sled Drag" }, select: { id: true } });
    expect(batch.get("qqx sled drag")!.id).toBe(own.id);
    // The new name was created once, in this workspace.
    expect(await prisma.exercise.count({ where: { workspaceId: ws, name: { equals: "Zzq Banded Thing", mode: "insensitive" } } })).toBe(1);
  }, 60_000);
});
