/**
 * 75 Hard, a miss fails it: only today can be checked in (the server refuses any other day), a missed day ends the goal
 * as failed on read, a failed goal takes no more check-ins, Start again starts a fresh one, and a goal started before
 * (no missFails in its rules) is never failed. On a throwaway workspace, removed afterwards.
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/goals/miss-fails.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TZ = "America/Los_Angeles";
const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: (k: string) => (k === "tz" ? { value: "America/Los_Angeles" } : undefined) }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

describe.skipIf(!process.env.ATLAS_DB_TEST)("75 Hard: a miss fails it", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let today = "";
  let addDays: (d: string, n: number) => string;
  let dayToDate: (d: string, tz: string) => Date;
  const tag = Date.now().toString(36);
  const users: Record<string, { user: string; client: string }> = {};
  const as = (who: string) => (current.user = { id: users[who].user, role: "CLIENT", workspaceId: ws, clientProfileId: users[who].client });

  /** Everything 75 Hard asks, done on `day`, written straight to the database (as if logged on that day). */
  async function fullDay(goalId: string, clientId: string, day: string) {
    const date = dayToDate(day, TZ);
    const a = await prisma.workoutLog.create({ data: { clientId, source: "OFF_PLAN", title: "Workout", date, completedAt: date, durationMin: 50 }, select: { id: true } });
    const b = await prisma.workoutLog.create({ data: { clientId, source: "OFF_PLAN", title: "Workout", date, completedAt: date, durationMin: 50 }, select: { id: true } });
    await prisma.goalCheckIn.createMany({
      data: [
        { goalId, ruleKey: "outdoors", day, workoutLogId: b.id, by: "CLIENT" },
        ...["water", "reading", "diet", "photo"].map((ruleKey) => ({ goalId, ruleKey, day, by: "CLIENT" as const })),
      ],
    });
    return a.id;
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ addDays } = await import("./days"));
    ({ dayToDate } = await import("@/lib/sessions/day"));
    const { localDay } = await import("@/lib/athlete/sessions");
    today = localDay(new Date(), TZ);
    ws = (await prisma.workspace.create({ data: { name: "miss-fails test" }, select: { id: true } })).id;
    for (const who of ["new", "old"]) {
      const user = (await prisma.user.create({ data: { email: `${tag}-${who}@guest.atlas.app`, name: who, role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
      const client = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user, fullName: `Test ${who}`, status: "ACTIVE" }, select: { id: true } })).id;
      users[who] = { user, client };
    }
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
    if (ws) expect(await prisma.workspace.count({ where: { id: ws } })).toBe(0);
  }, 60_000);

  it("a new start carries missFails; today can be ticked, any other day is refused by the server", async () => {
    as("new");
    const { startGoal, tickRule, logWorkout, tagSession } = await import("@/lib/actions/goals");
    const started = await startGoal({ templateKey: "builtin:75hard", startDay: today, shownDay: 1 });
    expect(started).toMatchObject({ ok: true, dayOfGoal: 1 });
    const goalId = (started as { goalId: string }).goalId;
    const row = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });
    expect((row.rules as { missFails?: boolean }).missFails).toBe(true);
    expect(row.timeZone).toBe(TZ);

    expect(await tickRule({ goalId, ruleKey: "water", day: today, on: true })).toEqual({ ok: true });

    // Yesterday fully met (so the goal is still running), started then: yesterday still can't be changed.
    const yesterday = addDays(today, -1);
    await prisma.goal.update({ where: { id: goalId }, data: { startDay: yesterday } });
    const yWorkout = await fullDay(goalId, users.new.client, yesterday);
    expect(await tickRule({ goalId, ruleKey: "water", day: yesterday, on: false })).toEqual({ ok: false, error: "Only today can be checked in." });
    expect(await logWorkout({ goalId, minutes: 45, day: yesterday })).toEqual({ ok: false, error: "Only today can be checked in." });
    expect(await tagSession({ goalId, sessionId: yWorkout, mark: "outdoors", on: true })).toEqual({ ok: false, error: "Only today can be checked in." });
    expect(await prisma.goalCheckIn.count({ where: { goalId, day: yesterday } })).toBe(5);
    expect((await prisma.goal.findUniqueOrThrow({ where: { id: goalId } })).status).toBe("ACTIVE");
  }, 60_000);

  it("a missed day fails it on read: ENDED, failedOn, endedAt at that day's end; no more check-ins; Today offers Start again", async () => {
    as("new");
    const { loadGoal, latestFailedGoal, failedOn } = await import("./data");
    const { tickRule } = await import("@/lib/actions/goals");
    const goal = await prisma.goal.findFirstOrThrow({ where: { clientId: users.new.client, status: "ACTIVE" } });
    const missed = addDays(today, -2);
    await prisma.goal.update({ where: { id: goal.id }, data: { startDay: missed } }); // nothing was done that day

    const loaded = await loadGoal(goal.id, users.new.client);
    expect(loaded?.goal.status).toBe("ENDED");
    expect(failedOn(loaded!.goal)).toBe(missed);
    const row = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(row.status).toBe("ENDED");
    expect((row.rules as { failedOn?: string }).failedOn).toBe(missed);
    const { localDay } = await import("@/lib/athlete/sessions");
    expect(localDay(row.endedAt!, TZ)).toBe(missed);

    const before = await prisma.goalCheckIn.count({ where: { goalId: goal.id } });
    await expect(tickRule({ goalId: goal.id, ruleKey: "reading", day: today, on: true })).rejects.toThrow("That goal isn't running.");
    expect(await prisma.goalCheckIn.count({ where: { goalId: goal.id } })).toBe(before);
    expect(await latestFailedGoal(users.new.client)).toEqual({ id: goal.id, name: "75 Hard", failedOn: missed });
  }, 60_000);

  it("a check-in on a goal that has failed but wasn't looked at since is refused, and writes the failure", async () => {
    as("new");
    const { startGoal, tickRule } = await import("@/lib/actions/goals");
    const r = (await startGoal({ templateKey: "builtin:75hard", startDay: today, shownDay: 1 })) as { ok: true; goalId: string };
    await prisma.goal.update({ where: { id: r.goalId }, data: { startDay: addDays(today, -1) } });
    await expect(tickRule({ goalId: r.goalId, ruleKey: "water", day: today, on: true })).rejects.toThrow("That goal isn't running.");
    const row = await prisma.goal.findUniqueOrThrow({ where: { id: r.goalId } });
    expect(row.status).toBe("ENDED");
    expect(await prisma.goalCheckIn.count({ where: { goalId: r.goalId } })).toBe(0);
  }, 60_000);

  it("Start again starts a fresh one from today, day 1, still with missFails", async () => {
    as("new");
    const { startGoal } = await import("@/lib/actions/goals");
    const { latestFailedGoal } = await import("./data");
    const r = await startGoal({ templateKey: "builtin:75hard", startDay: today, shownDay: 1 });
    expect(r).toMatchObject({ ok: true, dayOfGoal: 1 });
    const row = await prisma.goal.findUniqueOrThrow({ where: { id: (r as { goalId: string }).goalId } });
    expect(row).toMatchObject({ status: "ACTIVE", startDay: today });
    expect((row.rules as { missFails?: boolean }).missFails).toBe(true);
    expect(await latestFailedGoal(users.new.client)).toBeNull();
  }, 60_000);

  it("a goal started before (no missFails) with misses is never failed, and keeps yesterday's grace", async () => {
    as("old");
    const { GoalRules } = await import("./rules");
    const { SEVENTY_FIVE_HARD } = await import("./templates");
    const { loadGoal } = await import("./data");
    const { tickRule } = await import("@/lib/actions/goals");
    // Created the old way: the template's rules as they were (no missFails), started ten days ago, nothing done.
    const rules = GoalRules.parse({ ...SEVENTY_FIVE_HARD.rules, missFails: undefined });
    expect(rules.missFails).toBeUndefined();
    const g = await prisma.goal.create({
      data: { workspaceId: ws, clientId: users.old.client, templateKey: "builtin:75hard", name: "75 Hard", category: "challenge", rules, timeZone: TZ, startDay: addDays(today, -10), startedBy: "CLIENT" },
    });
    const loaded = await loadGoal(g.id, users.old.client);
    expect(loaded?.goal.status).toBe("ACTIVE");
    expect(loaded?.result.failedOn).toBeNull();
    expect(loaded?.result.misses).toBeGreaterThan(0);
    const row = await prisma.goal.findUniqueOrThrow({ where: { id: g.id } });
    expect(row).toMatchObject({ status: "ACTIVE", endedAt: null });
    expect(row.rules).toEqual(rules);
    // The old window: yesterday can still be ticked.
    expect(await tickRule({ goalId: g.id, ruleKey: "water", day: addDays(today, -1), on: true })).toEqual({ ok: true });
  }, 60_000);
});
