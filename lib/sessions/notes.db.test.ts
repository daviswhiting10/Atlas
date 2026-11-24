/**
 * Session notes by author: the coach's and the athlete's on one session, each labelled where it shows.
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/sessions/notes.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

describe.skipIf(!process.env.ATLAS_DB_TEST)("session notes by author", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  let coachId = "";
  let athleteUser = "";
  let clientId = "";
  let otherUser = "";
  let otherClient = "";
  let workoutId = "";
  let logId = "";
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const asCoach = () => (current.user = { id: coachId, role: "TRAINER", workspaceId: ws });
  const asAthlete = () => (current.user = { id: athleteUser, role: "CLIENT", workspaceId: ws, clientProfileId: clientId });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    const { createPlanForClient } = await import("@/lib/plan/persist");
    const { DEMO_PREFS } = await import("@/lib/guest");
    ws = (await prisma.workspace.create({ data: { name: "notes test" }, select: { id: true } })).id;
    coachId = (await prisma.user.create({ data: { email: `${tag}-coach@guest.atlas.app`, name: "Jess", role: "TRAINER", workspaceId: ws }, select: { id: true } })).id;
    athleteUser = (await prisma.user.create({ data: { email: `${tag}-sam@guest.atlas.app`, name: "Sam", role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
    clientId = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: athleteUser, fullName: "Sam Lee", status: "ACTIVE" }, select: { id: true } })).id;
    otherUser = (await prisma.user.create({ data: { email: `${tag}-kim@guest.atlas.app`, name: "Kim", role: "CLIENT", workspaceId: ws }, select: { id: true } })).id;
    otherClient = (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: otherUser, fullName: "Kim", status: "ACTIVE" }, select: { id: true } })).id;
    const made = await createPlanForClient({ workspaceId: ws, clientId, prefs: DEMO_PREFS, startDate: new Date() });
    workoutId = made.workouts[0].id;
    asAthlete();
    const { saveSet, finishWorkout } = await import("@/lib/actions/athlete");
    const r = await saveSet({ assignedWorkoutId: workoutId, aweId: made.workouts[0].exercises[0].id, setNumber: 1, weight: 100, reps: 8, done: true });
    logId = r.workoutLogId;
    await finishWorkout({ assignedWorkoutId: workoutId, durationMin: 30 });
  }, 120_000);

  afterAll(async () => {
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    if (ws) await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
  }, 60_000);

  it("the athlete writes their own note on Session complete; empty removes it; another athlete can't", async () => {
    const { saveMySessionNote } = await import("@/lib/actions/athlete");
    asAthlete();
    expect(await saveMySessionNote({ assignedWorkoutId: workoutId, text: "  Felt strong. Left knee a bit sore.  " })).toEqual({ ok: true });
    const row = await prisma.sessionNote.findFirstOrThrow({ where: { workoutLogId: logId, authorRole: "ATHLETE" }, select: { rawInput: true, clientId: true } });
    expect(row).toEqual({ rawInput: "Felt strong. Left knee a bit sore.", clientId });
    // The coach's note (clientNotes) is untouched by the athlete's.
    expect((await prisma.workoutLog.findUniqueOrThrow({ where: { id: logId }, select: { clientNotes: true } })).clientNotes).toBeNull();
    current.user = { id: otherUser, role: "CLIENT", workspaceId: ws, clientProfileId: otherClient };
    expect(await saveMySessionNote({ assignedWorkoutId: workoutId, text: "not mine" })).toMatchObject({ ok: false });
    expect(await prisma.sessionNote.count({ where: { workoutLogId: logId, authorRole: "ATHLETE" } })).toBe(1);
  }, 60_000);

  it("the coach's note is its own row (and clientNotes, for one release); both show, labelled, everywhere", async () => {
    asCoach();
    const { saveSessionNote, loadSessionNotes } = await import("./notes");
    await saveSessionNote({ workoutLogId: logId, clientId, date: new Date(), role: "COACH", text: "Great depth. Up 5 lb next week." });
    expect((await prisma.workoutLog.findUniqueOrThrow({ where: { id: logId }, select: { clientNotes: true } })).clientNotes).toBe("Great depth. Up 5 lb next week.");
    expect((await loadSessionNotes([{ id: logId }])).get(logId)).toEqual({ coach: "Great depth. Up 5 lb next week.", athlete: "Felt strong. Left knee a bit sore." });
    // The coach's card for the latest session.
    const { loadLatestSession } = await import("@/lib/coach/latest-session");
    const latest = (await loadLatestSession({ clientId, workspaceId: ws } as never)) as { note: string | null; athleteNote: string | null } | null;
    expect(latest).toMatchObject({ note: "Great depth. Up 5 lb next week.", athleteNote: "Felt strong. Left knee a bit sore." });
    // The athlete's History: "Coach" and "You".
    asAthlete();
    const { sessionSummary } = await import("@/lib/actions/athlete");
    expect((await sessionSummary(logId))!.notes).toEqual([
      { label: "Coach", text: "Great depth. Up 5 lb next week." },
      { label: "You", text: "Felt strong. Left knee a bit sore." },
    ]);
  }, 60_000);

  it("a note saved by older code (clientNotes only) still reads as the coach's", async () => {
    const { loadSessionNotes } = await import("./notes");
    expect((await loadSessionNotes([{ id: "no-such-log", clientNotes: "Old note" }])).get("no-such-log")).toEqual({ coach: "Old note", athlete: null });
  });

  it("a quick log's note is its author's: the athlete's stays out of clientNotes", async () => {
    const { saveQuickSession } = await import("@/lib/actions/quick-log");
    const day = new Date().toISOString().slice(0, 10);
    asAthlete();
    const a = (await saveQuickSession({ title: "Walk", durationMin: 30, date: day, notes: "Easy loop", exercises: [] })) as { ok: boolean; sessionId?: string; id?: string };
    expect(a.ok).toBe(true);
    const mine = await prisma.workoutLog.findFirstOrThrow({ where: { clientId, source: "OFF_PLAN" }, orderBy: { createdAt: "desc" }, select: { id: true, clientNotes: true } });
    expect(mine.clientNotes).toBeNull();
    expect(await prisma.sessionNote.findFirst({ where: { workoutLogId: mine.id }, select: { authorRole: true, rawInput: true } })).toEqual({ authorRole: "ATHLETE", rawInput: "Easy loop" });
    asCoach();
    const c = (await saveQuickSession({ clientId, title: "Bike", durationMin: 20, date: day, notes: "Zone 2", exercises: [] })) as { ok: boolean };
    expect(c.ok).toBe(true);
    const theirs = await prisma.workoutLog.findFirstOrThrow({ where: { clientId, source: "OFF_PLAN", title: "Bike" }, select: { id: true, clientNotes: true } });
    expect(theirs.clientNotes).toBe("Zone 2");
    expect(await prisma.sessionNote.findFirst({ where: { workoutLogId: theirs.id }, select: { authorRole: true } })).toEqual({ authorRole: "COACH" });
  }, 60_000);

  it("deleting a session removes its notes", async () => {
    const log = await prisma.workoutLog.create({ data: { clientId, source: "OFF_PLAN", date: new Date(), completedAt: new Date(), title: "Temp" }, select: { id: true } });
    const { saveSessionNote } = await import("./notes");
    await saveSessionNote({ workoutLogId: log.id, clientId, date: new Date(), role: "ATHLETE", text: "x" });
    await prisma.workoutLog.delete({ where: { id: log.id } });
    expect(await prisma.sessionNote.count({ where: { workoutLogId: log.id } })).toBe(0);
  }, 60_000);
});
