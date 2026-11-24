/**
 * Exercises added during a session are kept on it (WorkoutLog.addedExercises) and offered the next time the same workout
 * opens: "Add to today only" and "Add to plan from now on". Dev branches only:
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/sessions/added.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const DAY = 86_400_000;

describe.skipIf(!process.env.ATLAS_DB_TEST)("exercises added last time", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let athlete: typeof import("@/lib/actions/athlete");
  const ws = ["", ""];
  let users: Record<"sam" | "kim" | "coach" | "otherCoach", string> = { sam: "", kim: "", coach: "", otherCoach: "" };
  let sam = "";
  let kim = "";
  /** Sam's instances of one workout ("Day 1" in weeks 1..12), in plan order. */
  let day1: string[] = [];
  let row = "";
  let pulls = "";
  let plank = "";
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const asSam = () => (current.user = { id: users.sam, role: "CLIENT", workspaceId: ws[0], clientProfileId: sam });
  const asKim = () => (current.user = { id: users.kim, role: "CLIENT", workspaceId: ws[1], clientProfileId: kim });
  const asCoach = () => (current.user = { id: users.coach, role: "TRAINER", workspaceId: ws[0] });
  const asOtherCoach = () => (current.user = { id: users.otherCoach, role: "TRAINER", workspaceId: ws[1] });

  const exercisesOf = async (workoutId: string) =>
    (await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkoutId: workoutId }, select: { exerciseId: true } })).map((e) => e.exerciseId);
  const added = async (workoutId: string) => {
    const log = await prisma.workoutLog.findUnique({ where: { assignedWorkoutId: workoutId }, select: { addedExercises: true } });
    return ((log?.addedExercises as Array<{ exerciseId: string }> | null) ?? []).map((e) => e.exerciseId);
  };
  /** Log the first set of a workout and finish it. */
  async function logAndFinish(workoutId: string) {
    asSam();
    const awe = await prisma.assignedWorkoutExercise.findFirstOrThrow({ where: { assignedWorkoutId: workoutId }, orderBy: { order: "asc" }, select: { id: true } });
    await athlete.saveSet({ assignedWorkoutId: workoutId, aweId: awe.id, setNumber: 1, weight: 100, reps: 8, done: true });
    await athlete.finishWorkout({ assignedWorkoutId: workoutId, durationMin: 30 });
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    athlete = await import("@/lib/actions/athlete");
    const { createPlanForClient, ensureCatalog } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    for (const i of [0, 1]) ws[i] = (await prisma.workspace.create({ data: { name: `added test ${tag} ${i}` }, select: { id: true } })).id;
    const user = (name: string, role: "TRAINER" | "CLIENT", w: string) =>
      prisma.user.create({ data: { email: `${tag}-${name}@guest.atlas.app`, name, role, workspaceId: w }, select: { id: true } }).then((u) => u.id);
    users = { sam: await user("sam", "CLIENT", ws[0]), kim: await user("kim", "CLIENT", ws[1]), coach: await user("coach", "TRAINER", ws[0]), otherCoach: await user("other", "TRAINER", ws[1]) };
    // Both make their own plans (an athlete account), so both may add exercises.
    const meta = { athlete: { prefs: DEMO_PREFS, demo: false } };
    sam = (await prisma.clientProfile.create({ data: { workspaceId: ws[0], userId: users.sam, fullName: "Sam Lee", status: "ACTIVE", goalTargets: meta }, select: { id: true } })).id;
    kim = (await prisma.clientProfile.create({ data: { workspaceId: ws[1], userId: users.kim, fullName: "Kim Park", status: "ACTIVE", goalTargets: meta }, select: { id: true } })).id;
    for (const [w, c] of [[ws[0], sam], [ws[1], kim]]) await createPlanForClient({ workspaceId: w, clientId: c, prefs: DEMO_PREFS, startDate: new Date(Date.now() - 2 * DAY) });

    const first = await prisma.assignedWorkout.findFirstOrThrow({ where: { programAssignment: { clientId: sam } }, orderBy: { order: "asc" }, select: { name: true } });
    day1 = (await prisma.assignedWorkout.findMany({ where: { programAssignment: { clientId: sam }, name: first.name }, orderBy: { order: "asc" }, select: { id: true } })).map((w) => w.id);
    // Three library exercises none of Sam's Day 1s has.
    const ids = await ensureCatalog();
    const inDay1 = new Set((await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkoutId: { in: day1 } }, select: { exerciseId: true } })).map((e) => e.exerciseId));
    const free = Object.values(ids).filter((id) => !inDay1.has(id));
    [row, pulls, plank] = free;
  }, 180_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    for (const w of ws) if (w) await deleteGuestWorkspace(w, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
    for (const w of ws) if (w) await prisma.workspace.deleteMany({ where: { id: w } }).catch(() => {});
  }, 60_000);

  it("has a workout that repeats every week", () => {
    expect(day1.length).toBeGreaterThanOrEqual(6);
    expect(row && pulls && plank).toBeTruthy();
  });

  it("week 1: two exercises added mid-session (a third added and taken out again) are saved on the session", async () => {
    asSam();
    // Added before the first set: the session starts to hold the list.
    const a = await athlete.planAddExercise({ workoutId: day1[0], exerciseId: row, session: true });
    expect(a.ok).toBe(true);
    expect(await added(day1[0])).toEqual([row]);
    const b = await athlete.planAddExercise({ workoutId: day1[0], exerciseId: pulls, session: true });
    const c = await athlete.planAddExercise({ workoutId: day1[0], exerciseId: plank, session: true });
    expect(b.ok && c.ok).toBe(true);
    expect(await added(day1[0])).toEqual([row, pulls, plank]);
    await athlete.planRemoveExercise({ aweId: (c as { aweId: string }).aweId, workoutId: day1[0] });
    expect(await added(day1[0])).toEqual([row, pulls]);

    // Recording the same one again changes nothing.
    const { recordAdded } = await import("./added-store");
    await prisma.$transaction((tx) => recordAdded({ clientId: sam, assignedWorkoutId: day1[0], aweId: (b as { aweId: string }).aweId }, tx));
    expect(await added(day1[0])).toEqual([row, pulls]);
    // An add from the Plan screen (not in a session) isn't recorded.
    const plain = await athlete.planAddExercise({ workoutId: day1[1], exerciseId: plank });
    expect(plain.ok).toBe(true);
    expect(await prisma.workoutLog.findUnique({ where: { assignedWorkoutId: day1[1] } })).toBeNull();
    await athlete.planRemoveExercise({ aweId: (plain as { aweId: string }).aweId, workoutId: day1[1] });

    await logAndFinish(day1[0]);
    const log = await prisma.workoutLog.findUniqueOrThrow({ where: { assignedWorkoutId: day1[0] }, select: { completedAt: true, addedExercises: true } });
    expect(log.completedAt).not.toBeNull();
    expect((log.addedExercises as Array<{ name: string }>).map((e) => e.name)).toHaveLength(2);
  }, 120_000);

  it("a session started only to hold the list goes again when the list empties", async () => {
    asSam();
    const a = await athlete.planAddExercise({ workoutId: day1[5], exerciseId: plank, session: true });
    expect(await prisma.workoutLog.count({ where: { assignedWorkoutId: day1[5] } })).toBe(1);
    await athlete.planRemoveExercise({ aweId: (a as { aweId: string }).aweId, workoutId: day1[5] });
    expect(await prisma.workoutLog.count({ where: { assignedWorkoutId: day1[5] } })).toBe(0);
  }, 60_000);

  it("week 2's Day 1 offers them; Kim (another athlete) sees nothing of Sam's", async () => {
    asSam();
    const { getLoggerData } = await import("@/lib/athlete/data");
    const data = await getLoggerData(day1[1]);
    expect(data?.lastAdded?.exercises.map((e) => e.exerciseId)).toEqual([row, pulls]);
    const { addedSentence } = await import("./added");
    expect(addedSentence(data!.lastAdded!.exercises.map((e) => e.name))).toMatch(/^Last time you added .+ and .+\.$/);
    // Week 1 itself is done: no card there.
    expect((await getLoggerData(day1[0]))?.lastAdded ?? null).toBeNull();
    asKim();
    expect(await getLoggerData(day1[1])).toBeNull();
  }, 60_000);

  it("refused for another athlete, and for a coach outside the workspace", async () => {
    asKim();
    const r = await athlete.planAddLastTime({ workoutId: day1[1], fromNowOn: true });
    expect(r.ok).toBe(false);
    asOtherCoach();
    const { coachAddLastTime } = await import("@/lib/actions/coach-plan");
    const assignment = await prisma.assignedWorkout.findUniqueOrThrow({ where: { id: day1[1] }, select: { programAssignmentId: true } });
    expect((await coachAddLastTime(sam, assignment.programAssignmentId, { workoutId: day1[1], fromNowOn: true })).ok).toBe(false);
    for (const id of day1.slice(1)) expect(await exercisesOf(id)).not.toContain(row);
  }, 60_000);

  it("'Add to today only' adds them to week 2 only", async () => {
    asSam();
    const r = await athlete.planAddLastTime({ workoutId: day1[1], fromNowOn: false });
    expect(r).toMatchObject({ ok: true, today: 2, laterWorkouts: 0 });
    expect(await exercisesOf(day1[1])).toEqual(expect.arrayContaining([row, pulls]));
    for (const id of day1.slice(2)) {
      const ex = await exercisesOf(id);
      expect(ex).not.toContain(row);
      expect(ex).not.toContain(pulls);
    }
    // Twice is refused: they're in already.
    expect((await athlete.planAddLastTime({ workoutId: day1[1], fromNowOn: false })).ok).toBe(false);
    // And they're on week 2's session as added, so week 3 offers them again.
    expect(await added(day1[1])).toEqual([row, pulls]);
    await logAndFinish(day1[1]);
  }, 120_000);

  it("'Add to plan from now on' adds them to weeks 3..N, skipping finished ones and ones that have it", async () => {
    asSam();
    // Week 5 is finished already; week 4 has Cable Row already.
    await logAndFinish(day1[4]);
    asSam();
    await athlete.planAddExercise({ workoutId: day1[3], exerciseId: row });
    const before5 = await exercisesOf(day1[4]);
    const othersCount = () => prisma.assignedWorkoutExercise.count({ where: { assignedWorkout: { programAssignment: { clientId: sam }, id: { notIn: day1 } } } });
    const othersBefore = await othersCount();

    const r = await athlete.planAddLastTime({ workoutId: day1[2], fromNowOn: true });
    const later = day1.length - 3 - 1; // weeks 4..N less the finished week 5
    expect(r).toMatchObject({ ok: true, today: 2, laterWorkouts: later, laterRows: 2 * later - 1, skipped: 1 });

    expect(await exercisesOf(day1[2])).toEqual(expect.arrayContaining([row, pulls]));
    const w4 = await exercisesOf(day1[3]);
    expect(w4.filter((x) => x === row)).toHaveLength(1);
    expect(w4).toContain(pulls);
    expect(await exercisesOf(day1[4])).toEqual(before5);
    for (const id of day1.slice(5)) expect(await exercisesOf(id)).toEqual(expect.arrayContaining([row, pulls]));
    // Weeks before are untouched.
    expect(await exercisesOf(day1[0])).toEqual(expect.arrayContaining([row, pulls]));
    // Other workouts of the plan are untouched.
    expect(await othersCount()).toBe(othersBefore);
  }, 120_000);

  it("the coach logger's add is recorded too, on the coach's day", async () => {
    asCoach();
    const { coachAddExercise, coachRemoveExercise } = await import("@/lib/actions/coach-plan");
    const assignment = await prisma.assignedWorkout.findUniqueOrThrow({ where: { id: day1[5] }, select: { programAssignmentId: true } });
    const r = await coachAddExercise(sam, assignment.programAssignmentId, { workoutId: day1[5], exerciseId: plank, sets: 3, session: true, date: "2026-11-20" });
    expect(r.ok && r.workoutLogId).toBeTruthy();
    expect(await added(day1[5])).toEqual([plank]);
    const log = await prisma.workoutLog.findUniqueOrThrow({ where: { assignedWorkoutId: day1[5] }, select: { date: true } });
    expect(log.date.toISOString().slice(0, 10)).toBe("2026-11-20");
    await coachRemoveExercise(sam, assignment.programAssignmentId, { aweId: (r as { aweId: string }).aweId, workoutId: day1[5] });
    expect(await prisma.workoutLog.count({ where: { assignedWorkoutId: day1[5] } })).toBe(0);
  }, 60_000);
});
