/**
 * Guest cleanup and the demo cap, against a dev database (never production):
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/guest-cleanup.db.test.ts
 * It creates its own workspaces and removes them afterwards. It never touches
 * anyone else's rows.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// createGuest would otherwise clear out old guests on the dev database as a side effect.
vi.mock("@/lib/guest-cleanup", async (orig) => ({ ...(await orig<typeof import("@/lib/guest-cleanup")>()), cleanupExpiredGuests: vi.fn(async () => 0) }));

const RUN = !!process.env.ATLAS_DB_TEST;
const H = 3_600_000;

describe.skipIf(!RUN)("guest cleanup and the demo cap (dev database)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let cleanup: typeof import("@/lib/guest-cleanup");
  let guestLib: typeof import("@/lib/guest");
  let throttle: typeof import("@/lib/auth/throttle");
  let exerciseId: string;
  const tag = `t${Date.now().toString(36)}`;
  const mine: Record<string, { ws: string; users: string[]; client?: string }> = {};
  const seededUsers: string[] = [];
  const guestEmail = (n: string) => `${tag}-${n}@guest.atlas.app`;

  async function workspace(key: string, emails: string[], ageHours: number, withRows = true) {
    const ws = await prisma.workspace.create({ data: { name: `${tag} ${key}`, createdAt: new Date(Date.now() - ageHours * H) }, select: { id: true } });
    const users: string[] = [];
    for (let i = 0; i < emails.length; i++) users.push((await prisma.user.create({ data: { email: emails[i], name: `${tag}${i}`, role: "CLIENT", workspaceId: ws.id, emailVerified: new Date() }, select: { id: true } })).id);
    let client: string | undefined;
    if (users.length && withRows) {
      client = (await prisma.clientProfile.create({ data: { workspaceId: ws.id, userId: users[0], fullName: `${tag} ${key}`, status: "ACTIVE" }, select: { id: true } })).id;
      const log = await prisma.workoutLog.create({ data: { clientId: client, source: "OFF_PLAN", date: new Date(), completedAt: new Date() }, select: { id: true } });
      await prisma.setLog.createMany({ data: [1, 2].map((n) => ({ workoutLogId: log.id, exerciseId, setNumber: n, weight: 100, reps: 5 })) });
    }
    mine[key] = { ws: ws.id, users, client };
    return mine[key];
  }

  /** Everything under a workspace we can see from outside, as one string. */
  async function fingerprint(key: string) {
    const { ws, users, client } = mine[key];
    return JSON.stringify([
      await prisma.workspace.findUnique({ where: { id: ws } }),
      await prisma.user.findMany({ where: { workspaceId: ws }, orderBy: { id: "asc" } }),
      await prisma.clientProfile.findMany({ where: { workspaceId: ws }, orderBy: { id: "asc" } }),
      await prisma.workoutLog.findMany({ where: { clientId: client ?? "none" }, orderBy: { id: "asc" } }),
      await prisma.setLog.findMany({ where: { workoutLog: { clientId: client ?? "none" } }, orderBy: { id: "asc" } }),
      users.length,
    ]);
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    cleanup = await import("@/lib/guest-cleanup");
    guestLib = await import("@/lib/guest");
    throttle = await import("@/lib/auth/throttle");
    exerciseId = (await prisma.exercise.findFirstOrThrow({ where: { workspaceId: null }, select: { id: true } })).id;
    await workspace("oldGuest", [guestEmail("a")], 25);
    await workspace("oldMixed", [guestEmail("b"), `${tag}-real-b@example.com`], 48);
    await workspace("oldReal", [`${tag}-real-c@example.com`], 24 * 90);
    await workspace("oldEmpty", [], 48, false);
    await workspace("recentGuest", [guestEmail("e")], 1);
  }, 120_000);

  afterAll(async () => {
    // Our own rows only, leaf first.
    for (const { ws, users, client } of Object.values(mine)) {
      if (client) {
        await prisma.setLog.deleteMany({ where: { workoutLog: { clientId: client } } });
        await prisma.workoutLog.deleteMany({ where: { clientId: client } });
      }
      await prisma.clientProfile.deleteMany({ where: { workspaceId: ws } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.workspace.deleteMany({ where: { id: ws } });
    }
    await prisma.user.deleteMany({ where: { id: { in: seededUsers } } });
    await prisma.$disconnect();
  }, 120_000);

  it("only an old workspace whose every user is a guest is selected", async () => {
    const ids = (await cleanup.findExpiredGuestWorkspaces(100_000)).map((w) => w.id);
    expect(ids).toContain(mine.oldGuest.ws);
    for (const k of ["oldMixed", "oldReal", "oldEmpty", "recentGuest"]) expect(ids, k).not.toContain(mine[k].ws);
  }, 60_000);

  it("refuses to delete any other workspace, even when asked by id, and changes nothing", async () => {
    for (const k of ["oldMixed", "oldReal", "oldEmpty", "recentGuest"]) {
      const before = await fingerprint(k);
      await expect(cleanup.deleteGuestWorkspace(mine[k].ws), k).rejects.toThrow();
      await expect(cleanup.deleteGuestWorkspace(mine[k].ws, { dryRun: true }), k).rejects.toThrow();
      expect(await fingerprint(k), k).toBe(before);
    }
  }, 60_000);

  it("a dry run reports exact counts and deletes nothing; a real run deletes only the guest workspace", async () => {
    const before = await Promise.all(["oldMixed", "oldReal", "oldEmpty", "recentGuest"].map(fingerprint));
    const guestBefore = await fingerprint("oldGuest");
    const dry = await cleanup.deleteGuestWorkspace(mine.oldGuest.ws, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.deleted).toMatchObject({ SetLog: 2, WorkoutLog: 1, ClientProfile: 1, User: 1, Workspace: 1 });
    expect(await fingerprint("oldGuest")).toBe(guestBefore);

    const real = await cleanup.deleteGuestWorkspace(mine.oldGuest.ws);
    expect(real.deleted).toEqual(dry.deleted);
    expect(await prisma.workspace.findUnique({ where: { id: mine.oldGuest.ws } })).toBeNull();
    expect(await prisma.user.count({ where: { id: { in: mine.oldGuest.users } } })).toBe(0);
    expect(await prisma.setLog.count({ where: { workoutLog: { clientId: mine.oldGuest.client } } })).toBe(0);
    expect(await Promise.all(["oldMixed", "oldReal", "oldEmpty", "recentGuest"].map(fingerprint))).toEqual(before);
  }, 60_000);

  it("a real demo and a real try-it guest are removed completely, and a real workspace is untouched", async () => {
    const recentDemos = await prisma.user.count({ where: { role: "TRAINER", email: { endsWith: "@guest.atlas.app" }, createdAt: { gte: new Date(Date.now() - H) } } });
    if (recentDemos >= 9) return console.warn("skipped: the dev database already has 9+ demos from the last hour (the cap would refuse)");
    const realBefore = await fingerprint("oldReal");
    const demo = await guestLib.createGuest({ demo: true });
    const athlete = await guestLib.createGuest({ name: "Cleanup test" });
    const ids = [demo.workspaceId, athlete.workspaceId];
    const rows = async (ws: string) => (await prisma.assignedWorkoutExercise.count({ where: { workspaceId: ws } })) + (await prisma.clientProfile.count({ where: { workspaceId: ws } })) + (await prisma.program.count({ where: { workspaceId: ws } })) + (await prisma.setLog.count({ where: { workoutLog: { client: { workspaceId: ws } } } }));
    expect(await rows(demo.workspaceId)).toBeGreaterThan(1000);
    for (const ws of ids) await prisma.workspace.update({ where: { id: ws }, data: { createdAt: new Date(Date.now() - 25 * H) } });
    try {
      for (const ws of ids) {
        const r = await cleanup.deleteGuestWorkspace(ws);
        expect(r.deleted.Workspace).toBe(1);
        expect(await prisma.workspace.findUnique({ where: { id: ws } })).toBeNull();
        expect(await rows(ws)).toBe(0);
        expect(await prisma.goal.count({ where: { workspaceId: ws } })).toBe(0);
      }
    } finally {
      for (const ws of ids) if (await prisma.workspace.findUnique({ where: { id: ws } })) await cleanup.deleteGuestWorkspace(ws, { now: new Date(Date.now() + 48 * H) }).catch(() => {});
    }
    expect(await fingerprint("oldReal")).toBe(realBefore);
  }, 180_000);

  it("every table that can hold a workspace's rows is in the delete list", async () => {
    const covered = new Set<string>(cleanup.COVERED_TABLES);
    const withColumn = (await prisma.$queryRawUnsafe<{ t: string }[]>(`select table_name::text as t from information_schema.columns where table_schema='public' and column_name='workspaceId'`)).map((r) => r.t);
    // Any table with a restricting foreign key into the tree of rows that is deleted.
    const restricting = (
      await prisma.$queryRawUnsafe<{ t: string }[]>(
        `select distinct cl.relname::text as t from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_class rf on rf.oid=c.confrelid
         where c.contype='f' and c.confdeltype in ('a','r') and rf.relname in ('Workspace','User','ClientProfile','WorkoutLog','Goal','Conversation','Program','ProgramAssignment','AssignedWorkout','AssignedWorkoutExercise','Workout','Block','Exercise','Lead')`
      )
    ).map((r) => r.t);
    const missing = Array.from(new Set([...withColumn, ...restricting])).filter((t) => !covered.has(t));
    expect(missing, `tables not in COVERED_TABLES (add them to lib/guest-cleanup.ts, in delete order): ${missing.join(", ")}`).toEqual([]);
  }, 60_000);

  it("the demo cap is counted in the database: refuses at the overall cap", async () => {
    const since = new Date(Date.now() - H);
    const baseline = await prisma.user.count({ where: { role: "TRAINER", email: { endsWith: "@guest.atlas.app" }, createdAt: { gte: since } } });
    const seed = async (n: number) => {
      const u = await prisma.user.create({ data: { email: guestEmail(`demo${n}`), role: "TRAINER", name: tag }, select: { id: true } });
      seededUsers.push(u.id);
    };
    await seed(1);
    await seed(2);
    await expect(guestLib.assertDemoCapacity(null, baseline + 3)).resolves.toBeUndefined();
    await seed(3);
    await expect(guestLib.assertDemoCapacity(null, baseline + 3)).rejects.toBeInstanceOf(guestLib.DemoBusyError);
    await expect(guestLib.assertDemoCapacity(null, baseline + 4)).resolves.toBeUndefined();
  }, 60_000);

  it("the demo cap is counted in the database: 3 an hour per connection, the 4th is refused", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}`;
    const key = throttle.throttleKey("demoIp", ip);
    try {
      for (let i = 0; i < 3; i++) await expect(guestLib.assertDemoCapacity(ip, 1_000_000), `demo ${i + 1}`).resolves.toBeUndefined();
      await expect(guestLib.assertDemoCapacity(ip, 1_000_000)).rejects.toBeInstanceOf(guestLib.DemoBusyError);
      // another connection is unaffected
      await expect(guestLib.assertDemoCapacity("198.51.100.251", 1_000_000)).resolves.toBeUndefined();
      // and the window ends
      await expect(guestLib.assertDemoCapacity(ip, 1_000_000, new Date(Date.now() + 61 * 60_000))).resolves.toBeUndefined();
    } finally {
      await throttle.clear(key);
      await throttle.clear(throttle.throttleKey("demoIp", "198.51.100.251"));
    }
  }, 60_000);
});
