/**
 * The client page's week view: this plan week's workouts, done or not, whether it is a lighter week, and the plan's lead lifts.
 *
 * Runs against a dev database only:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/coach/week-data.db.test.ts
 * It makes its own workspace and removes it afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = !!process.env.ATLAS_DB_TEST;
const DAY = 86_400_000;

describe.skipIf(!RUN)("the week view", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  const clients: Record<string, string> = {};

  async function client(label: string, startedDaysAgo: number, loggedFirst: number) {
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    const user = await prisma.user.create({ data: { email: `${Date.now().toString(36)}-${label}@guest.atlas.app`, name: label, role: "CLIENT", workspaceId: ws, emailVerified: new Date() }, select: { id: true } });
    const id = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user.id, fullName: `Week test ${label}`, status: "ACTIVE" } })).id;
    const made = await createPlanForClient({ workspaceId: ws, clientId: id, prefs: DEMO_PREFS, startDate: new Date(Date.now() - startedDaysAgo * DAY) });
    // Log the first workouts of the current week.
    const week = Math.floor(startedDaysAgo / 7) + 1;
    const inWeek = made.workouts.filter((w) => w.week === week).sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
    for (const w of inWeek.slice(0, loggedFirst)) await prisma.workoutLog.create({ data: { clientId: id, assignedWorkoutId: w.id, source: "GENERATED", date: new Date(), completedAt: new Date(), durationMin: 40 } });
    return id;
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ws = (await prisma.workspace.create({ data: { name: "week-data test workspace" }, select: { id: true } })).id;
    clients.first = await client("first", 3, 2); // week 1, two of four done
    clients.lighter = await client("lighter", 24, 0); // week 4: a lighter week, nothing done
  }, 180_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("counts the workouts done of those planned this plan week", async () => {
    const { loadWeek } = await import("./week-data");
    const w = await loadWeek({ clientId: clients.first, workspaceId: ws });
    expect(w).toMatchObject({ done: 2, planned: 4, week: 1, lighter: false });
    expect(w!.chips.filter((c) => c.done)).toHaveLength(2);
    expect(w!.mainIds.length).toBeGreaterThan(0);
  });

  it("says when it is a lighter week", async () => {
    const { loadWeek } = await import("./week-data");
    expect(await loadWeek({ clientId: clients.lighter, workspaceId: ws })).toMatchObject({ week: 4, lighter: true, done: 0 });
  });

  it("is nothing for another workspace", async () => {
    const { loadWeek } = await import("./week-data");
    expect(await loadWeek({ clientId: clients.first, workspaceId: "not-this-workspace" })).toBeNull();
  });
});
