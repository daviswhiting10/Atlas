/**
 * A superset made mid-session and kept: written to this workout and to its later instances not yet logged, matched by
 * exercise. Logged instances are untouched; someone else's plan and a coach's client's plan are refused. A coach keeps one
 * for their own client from the coach logger; a coach from another workspace is refused.
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/plan/superset.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

type Row = { id: string; exerciseId: string; order: number; section: string | null };

describe.skipIf(!process.env.ATLAS_DB_TEST)("keeping a superset for this workout from now on", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let otherWs = "";
  let coach = "";
  let otherCoach = "";
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const people: Record<"sam" | "kim" | "lee", { user: string; client: string }> = { sam: { user: "", client: "" }, kim: { user: "", client: "" }, lee: { user: "", client: "" } };
  const as = (who: keyof typeof people) => (current.user = { id: people[who].user, role: "CLIENT", workspaceId: ws, clientProfileId: people[who].client });

  /** Sam's Day 1 in each week, in plan order: week 1 first. */
  let day1: string[] = [];
  let pair: [string, string] = ["", ""]; // exercise ids
  let loggedInstance = "";
  let skippedInstance = "";
  let loggedBefore: Row[] = [];

  const rowsOf = (workoutId: string): Promise<Row[]> =>
    prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkoutId: workoutId }, orderBy: { order: "asc" }, select: { id: true, exerciseId: true, order: true, section: true } });
  /** The pair's canonical sections in a workout, and whether they sit next to each other. */
  async function pairIn(workoutId: string) {
    const { canonicalSections } = await import("@/lib/workouts/structure");
    const rows = await rowsOf(workoutId);
    const sections = canonicalSections(rows, (r) => r.section);
    const i = rows.findIndex((r) => r.exerciseId === pair[0]);
    const j = rows.findIndex((r) => r.exerciseId === pair[1]);
    return { together: sections[i] === sections[j] && sections[i].startsWith("block:"), adjacent: j === i + 1 };
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: `superset test ${tag}` }, select: { id: true } })).id;
    coach = (await prisma.user.create({ data: { email: `${tag}-coach@guest.atlas.app`, name: "Jess", role: "TRAINER", workspaceId: ws }, select: { id: true } })).id;
    otherWs = (await prisma.workspace.create({ data: { name: `superset test other ${tag}` }, select: { id: true } })).id;
    otherCoach = (await prisma.user.create({ data: { email: `${tag}-other@guest.atlas.app`, name: "Max", role: "TRAINER", workspaceId: otherWs }, select: { id: true } })).id;
    for (const who of ["sam", "kim", "lee"] as const) {
      people[who].user = (await prisma.user.create({ data: { email: `${tag}-${who}@guest.atlas.app`, name: who, role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
      people[who].client = (
        await prisma.clientProfile.create({
          // Lee is a coach's client (no athlete prefs: the coach wrote the plan); Sam and Kim make their own.
          data: { workspaceId: ws, userId: people[who].user, fullName: `${who} test`, status: "ACTIVE", ...(who === "lee" ? {} : { goalTargets: { athlete: { prefs: DEMO_PREFS, demo: false } } }) },
          select: { id: true },
        })
      ).id;
      await createPlanForClient({ workspaceId: ws, clientId: people[who].client, prefs: DEMO_PREFS, startDate: new Date() });
    }
    const all = await prisma.assignedWorkout.findMany({ where: { programAssignment: { clientId: people.sam.client } }, orderBy: { order: "asc" }, select: { id: true, name: true } });
    day1 = all.filter((w) => w.name === all[0].name).map((w) => w.id);
    expect(day1.length).toBeGreaterThanOrEqual(4);

    // Two exercises of week 1's Day 1 that are in every Day 1 and not in one block: the first, and the last.
    const rows = await rowsOf(day1[0]);
    pair = [rows[0].exerciseId, rows[rows.length - 1].exerciseId];
    for (const id of day1) {
      const ex = (await rowsOf(id)).map((r) => r.exerciseId);
      expect(ex).toEqual(expect.arrayContaining(pair));
    }
    expect((await pairIn(day1[0])).together).toBe(false);

    // Week 2's Day 1 is logged already (its sets were done on another day); week 3's has lost the second exercise.
    loggedInstance = day1[1];
    skippedInstance = day1[2];
    as("sam");
    const { saveSet } = await import("@/lib/actions/athlete");
    const first = (await rowsOf(loggedInstance))[0];
    await saveSet({ assignedWorkoutId: loggedInstance, aweId: first.id, setNumber: 1, weight: 100, reps: 8, done: true });
    loggedBefore = await rowsOf(loggedInstance);
    const gone = (await rowsOf(skippedInstance)).find((r) => r.exerciseId === pair[1])!;
    await prisma.assignedWorkoutExercise.delete({ where: { id: gone.id } });
  }, 180_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    for (const w of [ws, otherWs]) if (w) await deleteGuestWorkspace(w, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("week 1's Day 1 grouped and kept: every later unlogged Day 1 has the pair in one block; logged and lacking ones are left", async () => {
    as("sam");
    const { planKeepSuperset } = await import("@/lib/actions/athlete");
    const rows = await rowsOf(day1[0]);
    const a = rows.find((r) => r.exerciseId === pair[0])!.id;
    const b = rows.find((r) => r.exerciseId === pair[1])!.id;
    const res = await planKeepSuperset({ workoutId: day1[0], aweIds: [a, b] });
    expect(res).toEqual({ ok: true, updated: day1.length - 3, skipped: 1 });

    expect(await pairIn(day1[0])).toEqual({ together: true, adjacent: true });
    for (const id of day1.slice(3)) expect(await pairIn(id)).toEqual({ together: true, adjacent: true });
    expect(await rowsOf(loggedInstance)).toEqual(loggedBefore);
    expect((await pairIn(loggedInstance)).together).toBe(false);
    // Each workout still reads as a plan: blocks numbered 1, 2, 3… with no gaps.
    const { canonicalSections } = await import("@/lib/workouts/structure");
    for (const id of [day1[0], ...day1.slice(3)]) {
      const r = await rowsOf(id);
      expect(r.map((x) => x.section)).toEqual(canonicalSections(r, (x) => x.section));
    }
  }, 120_000);

  it("the logger opens next week's Day 1 with the pair as a superset, from the plan alone", async () => {
    as("sam");
    const { getLoggerData } = await import("@/lib/athlete/data");
    const { sessionOrder, labelsOf } = await import("@/lib/sessions/order");
    const data = (await getLoggerData(day1[3]))!;
    const labels = labelsOf(sessionOrder(data.exercises.map((e) => ({ aweId: e.aweId, section: e.role })), null));
    const [x, y] = pair.map((p) => labels[data.exercises.find((e) => e.exerciseId === p)!.aweId]);
    expect(x).toMatch(/^\d+A$/);
    expect(y).toBe(x.replace("A", "B"));
  }, 60_000);

  it("splitting it, kept, takes it apart in the same workouts", async () => {
    as("sam");
    const { planKeepSuperset } = await import("@/lib/actions/athlete");
    const b = (await rowsOf(day1[0])).find((r) => r.exerciseId === pair[1])!.id;
    const res = await planKeepSuperset({ workoutId: day1[0], split: b });
    expect(res).toEqual({ ok: true, updated: day1.length - 3, skipped: 1 });
    for (const id of [day1[0], ...day1.slice(3)]) expect((await pairIn(id)).together).toBe(false);
    expect(await rowsOf(loggedInstance)).toEqual(loggedBefore);
  }, 120_000);

  it("another athlete is refused, and nothing changes", async () => {
    const before = await rowsOf(day1[0]);
    as("kim");
    const { planKeepSuperset } = await import("@/lib/actions/athlete");
    const res = await planKeepSuperset({ workoutId: day1[0], aweIds: [before[0].id, before[before.length - 1].id] });
    expect(res.ok).toBe(false);
    expect(await rowsOf(day1[0])).toEqual(before);
  }, 60_000);

  it("a coach's client is refused on their own plan", async () => {
    as("lee");
    const { planKeepSuperset } = await import("@/lib/actions/athlete");
    const w = await prisma.assignedWorkout.findFirstOrThrow({ where: { programAssignment: { clientId: people.lee.client } }, orderBy: { order: "asc" }, select: { id: true } });
    const before = await rowsOf(w.id);
    const res = await planKeepSuperset({ workoutId: w.id, aweIds: [before[0].id, before[before.length - 1].id] });
    expect(res).toEqual({ ok: false, error: "Your plan is managed by your coach." });
    expect(await rowsOf(w.id)).toEqual(before);
  }, 60_000);

  it("a coach keeps a superset for their client (the coach logger); a coach from another workspace is refused", async () => {
    const plan = await prisma.programAssignment.findFirstOrThrow({ where: { clientId: people.lee.client, status: "ACTIVE" }, select: { id: true } });
    const all = await prisma.assignedWorkout.findMany({ where: { programAssignmentId: plan.id }, orderBy: { order: "asc" }, select: { id: true, name: true } });
    const days = all.filter((w) => w.name === all[0].name).map((w) => w.id);
    const rows = await rowsOf(days[0]);
    const ids = [rows[0].id, rows[rows.length - 1].id];
    const { coachKeepSuperset } = await import("@/lib/actions/coach-plan");

    current.user = { id: otherCoach, role: "TRAINER", workspaceId: otherWs };
    expect((await coachKeepSuperset(people.lee.client, plan.id, { workoutId: days[0], aweIds: ids })).ok).toBe(false);
    expect(await rowsOf(days[0])).toEqual(rows);

    current.user = { id: coach, role: "TRAINER", workspaceId: ws };
    const res = await coachKeepSuperset(people.lee.client, plan.id, { workoutId: days[0], aweIds: ids });
    expect(res).toEqual({ ok: true, updated: days.length - 1, skipped: 0 });
    pair = [rows[0].exerciseId, rows[rows.length - 1].exerciseId];
    for (const id of days) expect(await pairIn(id)).toEqual({ together: true, adjacent: true });
  }, 120_000);
});
