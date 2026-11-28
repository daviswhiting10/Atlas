/**
 * Personal access tokens end to end, the CLIENT privacy sweep, and create_plan_from_outline, on the LOCAL database only:
 *   scripts/local-db.sh run env ATLAS_DB_TEST=1 npx vitest run lib/mcp/tokens.db.test.ts
 * Tokens are generated here and never printed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (current.user ? { user: current.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));

const RUN = !!process.env.ATLAS_DB_TEST && /@(localhost|127\.0\.0\.1):/.test(process.env.DATABASE_URL ?? "");

type Person = { user: string; client: string | null; email: string };

describe.skipIf(!RUN)("MCP tokens (local database)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let ws = "";
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const P = {} as Record<"coach" | "selfServe" | "coached" | "other", Person>;
  let planWorkouts: Array<{ id: string; exercises: Array<{ exerciseId: string }> }> = [];

  /** Sign the mocked session in as a person, the way the jwt callback fills it. */
  const signIn = async (p: Person) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: p.user }, select: { id: true, role: true, workspaceId: true, email: true } });
    const cp = u.role === "CLIENT" ? await prisma.clientProfile.findFirst({ where: { userId: u.id }, select: { id: true } }) : null;
    current.user = { id: u.id, role: u.role, workspaceId: u.workspaceId ?? undefined, clientProfileId: cp?.id, email: u.email };
  };
  const actions = () => import("@/lib/actions/mcp-tokens");
  const newToken = async (p: Person, name = "Claude") => {
    await signIn(p);
    const r = await (await actions()).createMcpToken({ name });
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  /** One JSON-RPC call to the real route, with a bearer token. */
  async function mcp(token: string | null, method: string, params: unknown) {
    const { POST } = await import("@/app/api/mcp/route");
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
    if (token !== null) headers.authorization = `Bearer ${token}`;
    const res = await POST(new Request("http://localhost/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
    const text = await res.text();
    const json = text.trim().startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
    return { status: res.status, json };
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ws = (await prisma.workspace.create({ data: { name: `mcp tokens ${tag}` }, select: { id: true } })).id;
    const person = async (key: keyof typeof P, role: "TRAINER" | "CLIENT", profile?: { name: string; selfServe: boolean }) => {
      const email = `${tag}-${key}@example.test`;
      const user = await prisma.user.create({ data: { email, role, workspaceId: ws }, select: { id: true } });
      const client = profile
        ? (await prisma.clientProfile.create({ data: { workspaceId: ws, userId: user.id, fullName: profile.name, status: "ACTIVE", goalTargets: profile.selfServe ? { athlete: { demo: false } } : undefined }, select: { id: true } })).id
        : null;
      P[key] = { user: user.id, client, email };
    };
    await person("coach", "TRAINER");
    await person("selfServe", "CLIENT", { name: "Avery Self", selfServe: true });
    await person("coached", "CLIENT", { name: "Blake Coached", selfServe: false });
    await person("other", "CLIENT", { name: "Casey Other", selfServe: true });

    // The self-serve athlete's live plan, two sessions logged on it (through MCP, as the athlete), and one off-plan session.
    const { saveSheetPlan } = await import("@/lib/programs/save-sheet-plan");
    const wk = (s: string) => [{ week: 1, setsReps: s }];
    await saveSheetPlan({
      workspaceId: ws,
      clientId: P.selfServe.client!,
      grid: { programName: "Old plan", days: [{ name: "Day 1", exercises: [{ name: "Back Squat", weeks: wk("3x5") }, { name: "Dumbbell Bench Press", weeks: wk("3x10") }, { name: "Plank", weeks: wk("3x30 sec") }] }, { name: "Day 2", exercises: [{ name: "Romanian Deadlift", weeks: wk("3x8") }] }] },
      name: "Old plan",
      goals: [],
      weekOneStart: new Date("2026-11-02T00:00:00"),
      context: { durationWeeks: 2, trainingDays: null, startAtWeek: 1 },
      history: false,
      status: "ACTIVE",
    });
    planWorkouts = await prisma.assignedWorkout.findMany({
      where: { programAssignment: { clientId: P.selfServe.client!, status: "ACTIVE" } },
      orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
      select: { id: true, exercises: { orderBy: { order: "asc" }, select: { exerciseId: true } } },
    });
    const { executeTool } = await import("./tool");
    const { logWorkout } = await import("./tools/workouts");
    const deps = { transport: "http" as const, audit: async () => {}, lookupClient: (await import("./data")).lookupClient, allowWrite: async () => true };
    const athlete = { userId: P.selfServe.user, role: "CLIENT" as const, workspaceId: ws, clientProfileId: P.selfServe.client };
    for (const [i, date] of [[0, "2026-11-02"], [1, "2026-11-04"]] as const) {
      const w = planWorkouts[i];
      const r = await executeTool(logWorkout, athlete, { assignedWorkoutId: w.id, date, complete: true, durationMin: 45, sets: w.exercises.map((e, j) => ({ exerciseId: e.exerciseId, setNumber: 1, weight: 100 + j * 10, reps: 8 })) }, deps);
      expect(r.outcome).toBe("ok");
    }
    const off = await prisma.workoutLog.create({ data: { clientId: P.selfServe.client!, source: "OFF_PLAN", title: "Hike", date: new Date("2026-11-05T12:00:00Z"), completedAt: new Date("2026-11-05T13:00:00Z") }, select: { id: true } });
    await prisma.setLog.create({ data: { workoutLogId: off.id, exerciseId: planWorkouts[0].exercises[0].exerciseId, setNumber: 1, weight: 135, reps: 5, completed: true } });
  }, 120_000);

  afterAll(async () => {
    if (!ws) return;
    // The cleanup takes guest workspaces only: these were real-looking accounts so tokens could be made.
    for (const p of Object.values(P)) await prisma.user.update({ where: { id: p.user }, data: { email: `${tag}-${p.user}@guest.atlas.app` } });
    const { deleteGuestWorkspace } = await import("@/lib/guest-cleanup");
    await deleteGuestWorkspace(ws, { ttlMs: 0, includeAthletes: true }).catch((e) => console.error("cleanup failed", e));
    expect(await prisma.mcpToken.count({ where: { userId: { in: Object.values(P).map((p) => p.user) } } })).toBe(0);
  }, 60_000);

  // ── The server actions ──────────────────────────────────────────────────

  describe("settings actions", () => {
    it("create returns the token once and stores only its hash; list and revoke see only your own", async () => {
      const { hashToken } = await import("./token");
      const made = await newToken(P.coach, "  Laptop  ");
      expect(made.name).toBe("Laptop");
      const row = await prisma.mcpToken.findUniqueOrThrow({ where: { id: made.id } });
      expect(row.tokenHash).toBe(hashToken(made.token));
      expect(JSON.stringify(row)).not.toContain(made.token);

      const { listMcpTokens, revokeMcpToken } = await actions();
      await signIn(P.coach);
      const mine = await listMcpTokens();
      expect(mine.map((t) => t.id)).toContain(made.id);
      expect(mine[0]).toEqual({ id: expect.any(String), name: expect.any(String), createdAt: expect.stringMatching(/Z$/), lastUsedAt: null, revokedAt: null });
      expect(JSON.stringify(mine)).not.toContain(made.token);

      await signIn(P.other);
      expect((await listMcpTokens()).map((t) => t.id)).not.toContain(made.id);
      expect(await revokeMcpToken({ id: made.id })).toEqual({ ok: false, error: "That token wasn't found." });
      expect((await prisma.mcpToken.findUniqueOrThrow({ where: { id: made.id } })).revokedAt).toBeNull();

      await signIn(P.coach);
      expect(await revokeMcpToken({ id: made.id })).toEqual({ ok: true });
      expect(await revokeMcpToken({ id: made.id })).toEqual({ ok: true });
      expect((await listMcpTokens()).find((t) => t.id === made.id)?.revokedAt).toEqual(expect.any(String));
    });

    it("refuses a bad name, an 11th active token, and a signed-out caller", async () => {
      const { createMcpToken, listMcpTokens, revokeMcpToken } = await actions();
      await signIn(P.coached);
      expect((await createMcpToken({ name: "   " })).ok).toBe(false);
      expect((await createMcpToken({ name: "x".repeat(61) })).ok).toBe(false);
      for (let i = 0; i < 10; i++) expect((await createMcpToken({ name: `t${i}` })).ok).toBe(true);
      expect(await createMcpToken({ name: "one more" })).toEqual({ ok: false, error: "You have 10 active tokens. Revoke one first." });
      // Newest first.
      const listed = await listMcpTokens();
      expect(listed).toHaveLength(10);
      expect(listed.map((t) => t.createdAt)).toEqual(listed.map((t) => t.createdAt).sort().reverse());
      // Revoking one makes room again.
      expect((await revokeMcpToken({ id: listed[0].id })).ok).toBe(true);
      expect((await createMcpToken({ name: "room again" })).ok).toBe(true);
      for (const t of await listMcpTokens()) await revokeMcpToken({ id: t.id });
      current.user = null;
      expect((await createMcpToken({ name: "x" })).ok).toBe(false);
      expect(await listMcpTokens()).toEqual([]);
    });
  });

  // ── Bearer sign-in ──────────────────────────────────────────────────────

  describe("bearer tokens on /api/mcp", () => {
    it("a revoked token and an unknown token are both 401, with nothing to tell them apart", async () => {
      const { generateToken } = await import("./token");
      const made = await newToken(P.selfServe);
      await signIn(P.selfServe);
      await (await actions()).revokeMcpToken({ id: made.id });
      current.user = null;
      const revoked = await mcp(made.token, "tools/list", {});
      const unknown = await mcp(generateToken(), "tools/list", {});
      expect(revoked).toEqual({ status: 401, json: { error: "Unauthorized" } });
      expect(unknown).toEqual(revoked);
    });

    it("a good token resolves to exactly the caller the session path gives the same user", async () => {
      const { resolveTokenCaller } = await import("./token");
      const { resolveSessionCaller } = await import("./session");
      for (const p of [P.coach, P.selfServe, P.coached]) {
        const made = await newToken(p);
        await signIn(p);
        const fromSession = await resolveSessionCaller();
        current.user = null;
        const fromToken = await resolveTokenCaller(made.token);
        expect(fromSession).not.toBeNull();
        expect(fromToken).toEqual({ caller: fromSession, tokenId: made.id });
      }
    });

    it("lastUsedAt is written at most once a minute", async () => {
      const { resolveTokenCaller } = await import("./token");
      const made = await newToken(P.coach);
      const t0 = new Date("2026-11-27T10:00:00Z");
      const used = async () => (await prisma.mcpToken.findUniqueOrThrow({ where: { id: made.id } })).lastUsedAt?.toISOString();
      await resolveTokenCaller(made.token, t0);
      expect(await used()).toBe(t0.toISOString());
      await resolveTokenCaller(made.token, new Date(t0.getTime() + 59_000));
      expect(await used()).toBe(t0.toISOString());
      const later = new Date(t0.getTime() + 61_000);
      await resolveTokenCaller(made.token, later);
      expect(await used()).toBe(later.toISOString());
    });

    it("serves tools over the route, and the audit row names the token", async () => {
      const made = await newToken(P.selfServe);
      current.user = null;
      const listed = await mcp(made.token, "tools/list", {});
      expect(listed.status).toBe(200);
      expect((listed.json.result.tools as Array<{ name: string }>).map((t) => t.name)).toContain("create_plan_from_outline");

      const called = await mcp(made.token, "tools/call", { name: "get_active_program", arguments: {} });
      expect(called.status).toBe(200);
      expect(called.json.result.isError).toBeFalsy();
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { workspaceId: ws, actorUserId: P.selfServe.user, tool: "get_active_program" }, orderBy: { createdAt: "desc" } });
      expect(audit).toMatchObject({ tokenId: made.id, outcome: "ok", transport: "http", clientId: P.selfServe.client });
    });

    it("a CLIENT token naming another client gets 404, not 403", async () => {
      const made = await newToken(P.selfServe);
      current.user = null;
      for (const tool of ["get_active_program", "get_workout_history", "get_user_fitness_profile"]) {
        const r = await mcp(made.token, "tools/call", { name: tool, arguments: { clientId: P.coached.client } });
        expect(r.status).toBe(200);
        expect(r.json.result.isError).toBe(true);
        expect(r.json.result.content[0].text).toBe("404 not found: Not found.");
      }
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { workspaceId: ws, actorUserId: P.selfServe.user, tool: "get_user_fitness_profile" }, orderBy: { createdAt: "desc" } });
      expect(audit).toMatchObject({ tokenId: made.id, outcome: "not_found", clientId: null });
    });
  });

  // ── Nothing coach-private and no photo reaches a CLIENT ──────────────────

  describe("CLIENT outputs", () => {
    /**
     * Coach-private, from the schema: ClientProfile.retentionScore / retentionFlag / reachOutDate (the coach's CRM),
     * OutreachMessage (the coach's messages and drafts), ExerciseCoachNote.note (the coach's per-exercise note, coach
     * logger only), TrainerObservation (the coach's AI corrections). Photo and file fields: ProgressPhoto.url / angle,
     * NutritionEntry.photoUrl, ExerciseMedia.url (the coach's photo or clip of an exercise), User.image, IntakeForm.rawFileUrl.
     * Each is filled with a marker; no CLIENT output may contain a marker or one of these field names.
     */
    const MARK = "ZZPRIVATE";
    const FIELDS = /"(retentionScore|retentionFlag|reachOutDate|outreach\w*|generatedDraft|sentVersion|coachNotes?|exerciseCoachNotes?|observations?|trainerVersion|aiVersion|progressPhotos?|photos?|photoUrl|photoId|chapterPhotoId|url|image|rawFileUrl|media|isMinor|isYouth)"\s*:/i;

    it("no tool returns them, whatever it is asked", async () => {
      const me = P.selfServe;
      const squat = planWorkouts[0].exercises[0].exerciseId;
      await prisma.clientProfile.update({ where: { id: me.client! }, data: { retentionScore: 987654, retentionFlag: `${MARK}-retention`, reachOutDate: new Date("2031-03-03T00:00:00Z") } });
      await prisma.user.update({ where: { id: me.user }, data: { image: `https://img.example/${MARK}-avatar.png` } });
      await prisma.outreachMessage.create({ data: { workspaceId: ws, clientId: me.client!, channel: "sms", purpose: "check-in", generatedDraft: `${MARK}-draft`, sentVersion: `${MARK}-sent` } });
      await prisma.exerciseCoachNote.create({ data: { workspaceId: ws, clientId: me.client!, exerciseId: squat, note: `${MARK}-coachnote` } });
      await prisma.trainerObservation.create({ data: { workspaceId: ws, context: `${MARK}-ctx`, aiVersion: `${MARK}-ai`, trainerVersion: `${MARK}-trainer`, tags: [] } });
      await prisma.progressPhoto.create({ data: { clientId: me.client!, date: new Date(), url: `https://blob.example/${MARK}-photo.jpg`, angle: "FRONT" } });
      await prisma.nutritionEntry.create({ data: { clientId: me.client!, date: new Date(), mealType: "lunch", photoUrl: `https://blob.example/${MARK}-meal.jpg` } });
      await prisma.exerciseMedia.create({ data: { workspaceId: ws, exerciseId: squat, url: `https://blob.example/${MARK}-media.mp4`, kind: "video", sizeBytes: 1 } });
      await prisma.intakeForm.create({ data: { clientId: me.client!, rawFileUrl: `https://blob.example/${MARK}-intake.pdf`, parsedData: {}, aiSummary: "Wants to squat more.", redFlags: [] } });

      const { TOOLS } = await import("./server");
      const { executeTool } = await import("./tool");
      const { lookupClient } = await import("./data");
      const deps = { transport: "http" as const, audit: async () => {}, lookupClient, allowWrite: async () => true };
      const caller = { userId: me.user, role: "CLIENT" as const, workspaceId: ws, clientProfileId: me.client };
      const w = planWorkouts[2];
      // Each tool a CLIENT may use, with arguments that reach its data. A write tool is checked on what it returns.
      const ARGS: Record<string, Array<Record<string, unknown>>> = {
        get_user_fitness_profile: [{}],
        get_active_program: [{}, { week: 2 }],
        get_workout_history: [{ limit: 50 }],
        get_exercise_history: [{ exerciseId: squat }],
        analyze_progress: [{ weeks: 52 }],
        get_training_recommendations: [{}],
        search_exercises: [{}, { query: "squat" }],
        log_workout: [{ assignedWorkoutId: w.id, sets: [{ exerciseId: w.exercises[0].exerciseId, setNumber: 1, weight: 95, reps: 8 }] }],
        edit_plan: [{ action: "set_note", text: "Felt good" }],
        create_plan_from_outline: [{ name: "Privacy check", weeks: 1, days: [{ name: "Day 1", exercises: [{ exercise: "Back Squat", prescription: "3x8" }] }] }],
      };
      const clientTools = TOOLS.filter((t) => t.roles.includes("CLIENT"));
      expect(clientTools.map((t) => t.name).sort()).toEqual(Object.keys(ARGS).sort());
      for (const t of clientTools) {
        for (const args of ARGS[t.name]) {
          const r = await executeTool(t, caller, args, deps);
          expect(r.outcome, `${t.name} ${JSON.stringify(r)}`).toBe("ok");
          const out = JSON.stringify((r as { data: unknown }).data);
          expect(out.length, t.name).toBeGreaterThan(2);
          expect(out, t.name).not.toContain(MARK);
          expect(out, t.name).not.toContain("987654");
          expect(out, t.name).not.toContain("2031-03-03");
          expect(out.match(FIELDS)?.[0] ?? null, t.name).toBeNull();
        }
      }
    }, 60_000);
  });

  // ── create_plan_from_outline ────────────────────────────────────────────

  describe("create_plan_from_outline", () => {
    const outline = (name: string) => ({
      name,
      weeks: 3,
      startDate: "2026-12-07",
      days: [
        { name: "Upper", exercises: [{ exercise: "DB Bench Press", prescription: "3x10" }, { exercise: "Back Squat", prescription: "5x5" }, { exercise: `Zork Press ${name}`, prescription: "3x8-12" }] },
        { name: "Day 2", exercises: [{ exercise: "Plank", prescription: "3x45 sec" }] },
      ],
    });
    const history = async (clientId: string) => {
      const logs = await prisma.workoutLog.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, date: true, completedAt: true, assignedWorkoutId: true, source: true, durationMin: true, title: true, sets: { orderBy: { id: "asc" }, select: { id: true, exerciseId: true, setNumber: true, weight: true, reps: true, completed: true, implements: true, assignedWorkoutExerciseId: true } } } });
      const workouts = await prisma.assignedWorkout.count({ where: { programAssignment: { clientId } } });
      return { logs, workouts };
    };
    const run = async (caller: { userId: string; role: "CLIENT" | "TRAINER"; clientProfileId: string | null }, args: Record<string, unknown>) => {
      const { executeTool } = await import("./tool");
      const { createPlanFromOutline } = await import("./tools/outline");
      const { lookupClient } = await import("./data");
      return executeTool(createPlanFromOutline, { ...caller, workspaceId: ws }, args, { transport: "http", audit: async () => {}, lookupClient, allowWrite: async () => true });
    };

    it("a self-serve athlete's new plan goes live; the old one is COMPLETED and every logged session and set is untouched", async () => {
      const me = P.selfServe;
      const old = await prisma.programAssignment.findFirstOrThrow({ where: { clientId: me.client!, status: "ACTIVE" }, select: { id: true, name: true } });
      const before = await history(me.client!);
      expect(before.logs.filter((l) => l.sets.length > 0).length).toBeGreaterThanOrEqual(3);

      const r = await run({ userId: me.user, role: "CLIENT", clientProfileId: me.client }, { ...outline("New block"), addSuggestedCore: false });
      expect(r.outcome).toBe("ok");
      const data = (r as { data: Record<string, unknown> }).data as {
        assignmentId: string; status: string; weeks: number; daysPerWeek: number; previousPlan: Array<{ assignmentId: string; status: string }>;
        exercises: Array<{ asWritten: string; matched: string; exerciseId: string; how: string }>; rangesAdded: string[]; coreWork: Array<{ day: string; added: boolean }>;
      };
      expect(data).toMatchObject({ status: "ACTIVE", weeks: 3, daysPerWeek: 2 });
      expect(data.previousPlan).toEqual([{ assignmentId: old.id, name: old.name, status: "COMPLETED", history: "kept" }]);

      // History: identical, row for row.
      expect(await history(me.client!)).toEqual({ ...before, workouts: before.workouts + 3 * 2 });
      expect((await prisma.programAssignment.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("COMPLETED");
      expect(await prisma.programAssignment.count({ where: { clientId: me.client!, status: "ACTIVE" } })).toBe(1);

      // Names: matched, shorthand spelled out, and an unknown one created for this workspace (never dropped).
      const zork = data.exercises.find((e) => e.asWritten.startsWith("Zork Press"))!;
      expect(zork.how).toBe("new");
      // Both lifts this athlete has logged continue their history.
      expect(data.exercises.find((e) => e.asWritten === "Back Squat")).toMatchObject({ how: "your history", exerciseId: planWorkouts[0].exercises[0].exerciseId });
      expect(data.exercises.find((e) => e.asWritten === "DB Bench Press")).toMatchObject({ how: "your history", matched: expect.stringMatching(/dumbbell/i) });
      expect(await prisma.exercise.count({ where: { workspaceId: ws, name: zork.matched } })).toBe(1);

      // The plan rules: 3x10 widened to 8-10; 5x5 kept and marked fixed; a written range kept; the Upper day flagged for core.
      const upper = await prisma.assignedWorkout.findFirstOrThrow({ where: { programAssignmentId: data.assignmentId, name: "Upper" }, orderBy: { scheduledDate: "asc" }, select: { id: true } });
      const rx = await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkoutId: upper.id }, orderBy: { order: "asc" }, select: { prescribedSets: true } });
      const first = (i: number) => (rx[i].prescribedSets as Array<{ repMin: number; repMax: number; notes: string }>)[0];
      expect(first(0)).toMatchObject({ repMin: 8, repMax: 10 });
      expect(first(1)).toMatchObject({ repMin: 5, repMax: 5, notes: "fixed: 5×5" });
      expect(first(2)).toMatchObject({ repMin: 8, repMax: 12 });
      expect(data.rangesAdded.some((l) => /Bench.*10 → 8–10/.test(l))).toBe(true);
      expect(data.coreWork).toEqual([{ day: "Upper", suggestion: expect.any(String), added: false }]);
    }, 60_000);

    it("addSuggestedCore adds the core suggestion to the flagged day", async () => {
      const me = P.other;
      // (Not "core" in the name: a name with "core" in it counts as core work.)
      const r = await run({ userId: me.user, role: "CLIENT", clientProfileId: me.client }, { ...outline("Second block"), addSuggestedCore: true });
      expect(r.outcome).toBe("ok");
      const { assignmentId, coreWork } = (r as { data: { assignmentId: string; coreWork: Array<{ added: boolean }> } }).data;
      expect(coreWork).toEqual([expect.objectContaining({ added: true })]);
      const upper = await prisma.assignedWorkout.findFirstOrThrow({ where: { programAssignmentId: assignmentId, name: "Upper" }, select: { _count: { select: { exercises: true } } } });
      expect(upper._count.exercises).toBe(4);
    }, 60_000);

    it("a coach's plan for a client is a DRAFT; the live plan and its history are untouched", async () => {
      const me = P.selfServe;
      const live = await prisma.programAssignment.findFirstOrThrow({ where: { clientId: me.client!, status: "ACTIVE" }, select: { id: true } });
      const before = await history(me.client!);
      const r = await run({ userId: P.coach.user, role: "TRAINER", clientProfileId: null }, { clientId: me.client, ...outline("Coach draft") });
      expect(r.outcome).toBe("ok");
      const data = (r as { data: { assignmentId: string; status: string; previousPlan: unknown } }).data;
      expect(data.status).toBe("DRAFT");
      expect(typeof data.previousPlan).toBe("string");
      expect((await prisma.programAssignment.findUniqueOrThrow({ where: { id: data.assignmentId } })).status).toBe("PAUSED");
      expect((await prisma.programAssignment.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("ACTIVE");
      expect(await history(me.client!)).toEqual({ ...before, workouts: before.workouts + 6 });
    }, 60_000);

    it("a coached athlete can't build their own plan (the app's rule), and nothing is written", async () => {
      const me = P.coached;
      const plans = await prisma.programAssignment.count({ where: { clientId: me.client! } });
      const r = await run({ userId: me.user, role: "CLIENT", clientProfileId: me.client }, outline("Not mine"));
      expect(r).toEqual({ outcome: "forbidden", message: "Your plan comes from your coach." });
      expect(await prisma.programAssignment.count({ where: { clientId: me.client! } })).toBe(plans);
    });

    it("a written name lands on the lift this person logs: 'Bench Press' → their Barbell Bench Press, not the library's or the dumbbell", async () => {
      const me = P.coached;
      const ex = (name: string, extra: Record<string, unknown> = {}) =>
        prisma.exercise.create({ data: { workspaceId: ws, name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`, movementPattern: "HORIZONTAL_PUSH", equipment: "BARBELL", primaryMuscles: [], secondaryMuscles: [], instructions: [], ...extra }, select: { id: true } });
      const barbell = await ex("Barbell Bench Press");
      // An older name merged into it: its sets count for the survivor.
      await ex("Flat BB Bench", { mergedIntoId: barbell.id });
      const merged = await prisma.exercise.findFirstOrThrow({ where: { workspaceId: ws, name: "Flat BB Bench" }, select: { id: true } });
      const libraryBench = await prisma.exercise.findFirstOrThrow({ where: { workspaceId: null, name: "Bench Press", mergedIntoId: null }, select: { id: true } });
      const dumbbell = await prisma.exercise.findFirstOrThrow({ where: { workspaceId: null, name: "Dumbbell Bench Press", mergedIntoId: null }, select: { id: true } });
      const log = await prisma.workoutLog.create({ data: { clientId: me.client!, source: "OFF_PLAN", title: "Old bench days", date: new Date("2026-10-01T12:00:00Z"), completedAt: new Date("2026-10-01T13:00:00Z") }, select: { id: true } });
      const sets = (exerciseId: string, n: number) => Array.from({ length: n }, (_, i) => ({ workoutLogId: log.id, exerciseId, setNumber: i + 1, weight: 135, reps: 5, completed: true }));
      // More dumbbell sets than barbell: still not a match for a bare "Bench Press".
      await prisma.setLog.createMany({ data: [...sets(barbell.id, 3), ...sets(merged.id, 2), ...sets(dumbbell.id, 8)] });

      const r = await run({ userId: P.coach.user, role: "TRAINER", clientProfileId: null }, {
        clientId: me.client, name: "Match check", weeks: 1,
        days: [{ name: "Day 1", exercises: [{ exercise: "Bench Press", prescription: "3x5" }, { exercise: "Press", prescription: "3x5" }, { exercise: "Back Squat", prescription: "3x5" }, { exercise: "Squat", prescription: "3x5" }] }],
      });
      expect(r.outcome).toBe("ok");
      const data = (r as { data: { assignmentId: string; exercises: Array<{ asWritten: string; matched: string; exerciseId: string; how: string }> } }).data;
      // No squat history: the shared library's Back Squat (a bare "Squat" is the back squat), not a new exercise.
      expect(data.exercises.find((e) => e.asWritten === "Squat")).toMatchObject({ matched: "Back Squat", how: "library" });
      expect(await prisma.exercise.count({ where: { workspaceId: ws, name: "Squat" } })).toBe(0);
      const by = (n: string) => data.exercises.find((e) => e.asWritten === n)!;
      expect(by("Bench Press")).toEqual({ asWritten: "Bench Press", matched: "Barbell Bench Press", exerciseId: barbell.id, how: "your history" });
      expect(by("Back Squat").how).toBe("library");
      // A broad word doesn't take the bench history.
      expect(by("Press").exerciseId).not.toBe(barbell.id);

      // The saved plan's bench is the history exercise.
      const saved = await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkout: { programAssignmentId: data.assignmentId } }, select: { exerciseId: true } });
      const ids = saved.map((s) => s.exerciseId);
      expect(ids).toContain(barbell.id);
      expect(ids).not.toContain(libraryBench.id);
      expect(ids).not.toContain(dumbbell.id);
    }, 60_000);

    it("a superset group is saved as one block, and get_active_program shows the pair (1A, 1B)", async () => {
      const me = P.other;
      const r = await run({ userId: me.user, role: "CLIENT", clientProfileId: me.client }, {
        name: "Superset block", weeks: 1, startDate: "2026-12-07",
        days: [{ name: "Upper", exercises: [
          { exercise: "Dumbbell Bench Press", prescription: "3x10", group: "A" },
          { exercise: "Face Pull", prescription: "3x15", group: "A" },
          { exercise: "Back Squat", prescription: "3x5" },
          { exercise: "Plank", prescription: "3x30 sec" },
        ] }],
      });
      expect(r.outcome).toBe("ok");
      const { assignmentId } = (r as { data: { assignmentId: string } }).data;
      const saved = await prisma.assignedWorkoutExercise.findMany({ where: { assignedWorkout: { programAssignmentId: assignmentId } }, orderBy: { order: "asc" }, select: { section: true } });
      expect(saved.map((e) => e.section)).toEqual(["block:1", "block:1", "block:2", "block:3"]);

      const { executeTool } = await import("./tool");
      const { getActiveProgram } = await import("./tools/programs");
      const { lookupClient } = await import("./data");
      const shown = await executeTool(getActiveProgram, { userId: me.user, role: "CLIENT", workspaceId: ws, clientProfileId: me.client }, { week: 1 }, { transport: "http", audit: async () => {}, lookupClient, allowWrite: async () => true });
      const program = (shown as { data: { program: { assignmentId: string; workouts: Array<{ exercises: Array<{ block: string | null }> }> } } }).data.program;
      expect(program.assignmentId).toBe(assignmentId);
      expect(program.workouts[0].exercises.map((e) => e.block)).toEqual(["1A", "1B", "2", "3"]);
    }, 60_000);

    it("a prescription that isn't sets x reps is refused before anything is written", async () => {
      const r = await run({ userId: P.coach.user, role: "TRAINER", clientProfileId: null }, { clientId: P.coached.client, name: "Bad", days: [{ name: "D", exercises: [{ exercise: "Back Squat", prescription: "heavy" }] }] });
      expect(r.outcome).toBe("validation_error");
    });
  });

  // ── log_workout says what it earned ─────────────────────────────────────

  describe("log_workout: new PRs and milestones", () => {
    it("returns the record and the milestones this call created, and nothing when the same set is sent again", async () => {
      const { executeTool } = await import("./tool");
      const { logWorkout } = await import("./tools/workouts");
      const deps = { transport: "http" as const, audit: async () => {}, lookupClient: (await import("./data")).lookupClient, allowWrite: async () => true };
      const athlete = { userId: P.selfServe.user, role: "CLIENT" as const, workspaceId: ws, clientProfileId: P.selfServe.client };
      // Back Squat so far: 100 (plan) and 135 (off plan). 140 is a record and a first plate.
      const w = planWorkouts[0];
      const squat = w.exercises[0].exerciseId;
      const call = () => executeTool(logWorkout, athlete, { assignedWorkoutId: w.id, sets: [{ exerciseId: squat, setNumber: 2, weight: 140, reps: 5 }] }, deps);
      const r = await call();
      expect(r.outcome).toBe("ok");
      const data = (r as { data: { newPRs: unknown[]; newMilestones: Array<{ kind: string; exercise?: string }> } }).data;
      expect(data.newPRs).toEqual([{ exercise: "Back Squat", weightLb: 140, previousBestLb: 135 }]);
      expect(data.newMilestones.map((m) => m.kind).sort()).toEqual(["first_pr", "plate_squat_135"]);
      expect(data.newMilestones.every((m) => m.exercise === "Back Squat")).toBe(true);

      const again = (await call()) as { data: { newPRs: unknown[]; newMilestones: unknown[] } };
      expect(again.data).toMatchObject({ newPRs: [], newMilestones: [] });
    }, 60_000);

    it("a PR milestone from this call is listed in newPRs too (earlier sets had no weight): one answer, not two", async () => {
      const { executeTool } = await import("./tool");
      const { logWorkout } = await import("./tools/workouts");
      const deps = { transport: "http" as const, audit: async () => {}, lookupClient: (await import("./data")).lookupClient, allowWrite: async () => true };
      const athlete = { userId: P.selfServe.user, role: "CLIENT" as const, workspaceId: ws, clientProfileId: P.selfServe.client };
      const w = planWorkouts[0];
      const lift = w.exercises[w.exercises.length - 1];
      // Earlier sets of this lift with reps but no weight (ticked without one).
      const old = await prisma.workoutLog.create({ data: { clientId: P.selfServe.client!, source: "OFF_PLAN", title: "No weights", date: new Date("2026-10-02T12:00:00Z"), completedAt: new Date("2026-10-02T13:00:00Z") }, select: { id: true } });
      await prisma.setLog.createMany({ data: [1, 2].map((n) => ({ workoutLogId: old.id, exerciseId: lift.exerciseId, setNumber: n, weight: null, reps: 8, completed: true })) });
      const r = await executeTool(logWorkout, athlete, { assignedWorkoutId: w.id, sets: [{ exerciseId: lift.exerciseId, setNumber: 1, weight: 95, reps: 8 }] }, deps);
      expect(r.outcome).toBe("ok");
      const data = (r as { data: { newPRs: Array<{ exercise: string; previousBestLb: number | null }>; newMilestones: Array<{ kind: string; exercise?: string }> } }).data;
      for (const m of data.newMilestones.filter((x) => x.kind === "first_pr")) {
        expect(data.newPRs.find((p) => p.exercise === m.exercise)).toMatchObject({ previousBestLb: null });
      }
    }, 60_000);

    it("implements: 1 and 2 are stored as sent on a dumbbell set, omitted gives the default, and other equipment never gets one", async () => {
      const { executeTool } = await import("./tool");
      const { logWorkout } = await import("./tools/workouts");
      const deps = { transport: "http" as const, audit: async () => {}, lookupClient: (await import("./data")).lookupClient, allowWrite: async () => true };
      const athlete = { userId: P.selfServe.user, role: "CLIENT" as const, workspaceId: ws, clientProfileId: P.selfServe.client };
      const w = planWorkouts[0];
      const [squat, bench] = w.exercises.map((e) => e.exerciseId);
      const r = await executeTool(logWorkout, athlete, {
        assignedWorkoutId: w.id,
        sets: [
          { exerciseId: bench, setNumber: 3, weight: 40, reps: 10, implements: 1 },
          { exerciseId: bench, setNumber: 4, weight: 40, reps: 10, implements: 2 },
          { exerciseId: bench, setNumber: 5, weight: 40, reps: 10 },
          { exerciseId: squat, setNumber: 3, weight: 95, reps: 5, implements: 2 },
        ],
      }, deps);
      expect(r.outcome).toBe("ok");
      const log = await prisma.workoutLog.findUniqueOrThrow({ where: { assignedWorkoutId: w.id }, select: { id: true } });
      const stored = async (exerciseId: string, setNumber: number) => (await prisma.setLog.findFirstOrThrow({ where: { workoutLogId: log.id, exerciseId, setNumber }, select: { implements: true } })).implements;
      expect(await stored(bench, 3)).toBe(1);
      expect(await stored(bench, 4)).toBe(2);
      expect(await stored(bench, 5)).toBe(2);
      expect(await stored(squat, 3)).toBeNull();
      // Sent again with a change: the update keeps what was sent.
      await executeTool(logWorkout, athlete, { assignedWorkoutId: w.id, sets: [{ exerciseId: bench, setNumber: 4, weight: 40, reps: 10, implements: 1 }] }, deps);
      expect(await stored(bench, 4)).toBe(1);
    }, 60_000);
  });
});
