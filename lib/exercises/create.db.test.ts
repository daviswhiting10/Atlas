/**
 * A typed exercise, against a dev database (never production):
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/exercises/create.db.test.ts
 * It creates its own workspaces and removes them afterwards. It never touches anyone else's rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("createCustomExercise (dev database)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let create: typeof import("./create").createCustomExercise;
  let visibleTo: typeof import("./find").visibleTo;
  let searchTool: { handler: (ctx: unknown, args: unknown) => Promise<{ exercises?: Array<{ id: string; name: string }> } & Record<string, unknown>> };
  const tag = `t${Date.now().toString(36)}`;
  let wsA = "";
  let wsB = "";
  const made: string[] = [];

  beforeAll(async () => {
    const { isProductionDatabase } = await import("@/lib/db/production");
    if (isProductionDatabase(process.env.DATABASE_URL)) throw new Error("refusing: production");
    ({ prisma } = await import("@/lib/db/client"));
    ({ createCustomExercise: create } = await import("./create"));
    ({ visibleTo } = await import("./find"));
    searchTool = (await import("@/lib/mcp/tools/exercises")).searchExercises as never;
    wsA = (await prisma.workspace.create({ data: { name: `${tag} A` }, select: { id: true } })).id;
    wsB = (await prisma.workspace.create({ data: { name: `${tag} B` }, select: { id: true } })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exercise.deleteMany({ where: { workspaceId: { in: [wsA, wsB].filter(Boolean) } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [wsA, wsB].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  const name = (s: string) => `${s} ${tag}`;

  it("saves a name only: this workspace's own, no muscles, guessed pattern and equipment", async () => {
    const e = (await create(wsA, name("handstand walk")))!;
    made.push(e.id);
    expect(e.created).toBe(true);
    const row = await prisma.exercise.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.workspaceId).toBe(wsA);
    expect(row.name.startsWith("Handstand Walk ")).toBe(true); // all-lowercase typing is shown as a name
    expect(row.primaryMuscles).toEqual([]);
    expect(row.secondaryMuscles).toEqual([]);
    expect(row.mergedIntoId).toBeNull();
  });

  it("the same name again, any case, plural or spacing, is the same row", async () => {
    const first = (await create(wsA, name("cossack squat")))!;
    const again = [await create(wsA, name("Cossack Squats")), await create(wsA, `  ${name("COSSACK  SQUAT")}  `)];
    expect(again.every((e) => e && e.id === first.id && !e.created)).toBe(true);
    expect(await prisma.exercise.count({ where: { workspaceId: wsA, name: { contains: "ossack", mode: "insensitive" } } })).toBe(1);
  });

  it("a tap repeated at the same moment still makes one", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => create(wsA, name("sled drag"))));
    expect(new Set(results.map((r) => r!.id)).size).toBe(1);
    expect(await prisma.exercise.count({ where: { workspaceId: wsA, slug: results[0]!.slug } })).toBe(1);
  });

  it("an exercise already in the shared library is returned, not copied", async () => {
    const shared = await prisma.exercise.findFirstOrThrow({ where: { workspaceId: null, mergedIntoId: null }, select: { id: true, name: true } });
    const e = (await create(wsA, shared.name.toLowerCase()))!;
    expect(e.id).toBe(shared.id);
    expect(e.created).toBe(false);
  });

  it("is private to its workspace, in the picker's source and in the MCP search", async () => {
    const mine = (await create(wsA, name("zottman curl")))!;
    const inA = await prisma.exercise.findMany({ where: { ...visibleTo(wsA), name: { contains: tag, mode: "insensitive" } }, select: { id: true } });
    const inB = await prisma.exercise.findMany({ where: { ...visibleTo(wsB), name: { contains: tag, mode: "insensitive" } }, select: { id: true } });
    expect(inA.map((e) => e.id)).toContain(mine.id);
    expect(inB.map((e) => e.id)).not.toContain(mine.id);

    const found = await searchTool.handler({ caller: { workspaceId: wsA } }, { query: "zottman", limit: 20 });
    expect(JSON.stringify(found)).toContain(mine.id);
    const notFound = await searchTool.handler({ caller: { workspaceId: wsB } }, { query: "zottman", limit: 20 });
    expect(JSON.stringify(notFound)).not.toContain(mine.id);
  });

  it("another workspace typing the same name gets its own, not the first one's", async () => {
    const a = (await create(wsA, name("bear crawl")))!;
    const b = (await create(wsB, name("bear crawl")))!;
    expect(b.id).not.toBe(a.id);
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: b.id } })).workspaceId).toBe(wsB);
  });

  it("empty, blank and symbol-only names make nothing", async () => {
    const before = await prisma.exercise.count({ where: { workspaceId: wsA } });
    for (const bad of ["", "   ", "\n\t", "!!!", null, undefined, 7]) expect(await create(wsA, bad)).toBeNull();
    expect(await prisma.exercise.count({ where: { workspaceId: wsA } })).toBe(before);
  });

  it("a very long name is cut to 80 characters", async () => {
    const e = (await create(wsA, "a".repeat(400)))!;
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: e.id } })).name.length).toBe(80);
  });

  it("stays after the workout it was added to is deleted", async () => {
    const e = (await create(wsA, name("tire flip")))!;
    const user = await prisma.user.create({ data: { email: `${tag}-x@guest.atlas.app`, role: "CLIENT", workspaceId: wsA }, select: { id: true } });
    const client = await prisma.clientProfile.create({ data: { workspaceId: wsA, userId: user.id, fullName: `${tag} x`, status: "ACTIVE" }, select: { id: true } });
    const log = await prisma.workoutLog.create({ data: { clientId: client.id, source: "OFF_PLAN", date: new Date(), completedAt: new Date() }, select: { id: true } });
    await prisma.setLog.create({ data: { workoutLogId: log.id, exerciseId: e.id, setNumber: 1, weight: 0, reps: 8 } });
    await prisma.setLog.deleteMany({ where: { workoutLogId: log.id } });
    await prisma.workoutLog.delete({ where: { id: log.id } });
    expect(await prisma.exercise.findUnique({ where: { id: e.id } })).not.toBeNull();
    expect(await prisma.exercise.count({ where: { ...visibleTo(wsA), id: e.id } })).toBe(1);
    await prisma.clientProfile.delete({ where: { id: client.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
