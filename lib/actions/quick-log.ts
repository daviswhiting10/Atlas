"use server";

/**
 * Quick log: a workout done outside any plan, for coaches (any client in
 * their workspace) and athletes (themselves). One save creates a finished
 * OFF_PLAN session with its sets.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { athleteIdentity } from "@/lib/athlete/identity";
import { prisma } from "@/lib/db/client";
import { MovementPattern, Prisma } from "@/app/generated/prisma/client";
import { displayName } from "@/lib/plan/catalog";
import { checkSessionMilestones } from "@/lib/progress/milestones";
import { requestDay } from "@/lib/sessions/request-day";
import { QuickSessionInput, cleanSession, matchesTokens, searchTokens, type LastTime, type QuickSet } from "@/lib/sessions/quick-log";

type Scope = { clientId: string; workspaceId: string; by: "coach" | "athlete" };
const Ref = z.string().min(1).max(64);

/**
 * Whose workout this is. A coach names the client, who must be in their
 * workspace; anyone else logs for themselves (an athlete, or a coach's own
 * training). Never trusts a client id from an athlete.
 */
async function scopeFor(clientId?: string | null): Promise<Scope> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) throw new Error("Unauthorized");
  if (clientId && user.role !== "CLIENT" && user.workspaceId) {
    const client = await prisma.clientProfile.findFirst({ where: { id: Ref.parse(clientId), workspaceId: user.workspaceId, deletedAt: null }, select: { id: true } });
    if (!client) throw new Error("Client not found");
    return { clientId: client.id, workspaceId: user.workspaceId, by: "coach" };
  }
  const identity = await athleteIdentity(user);
  if (!identity) throw new Error("Unauthorized");
  return { clientId: identity.clientId, workspaceId: identity.workspaceId, by: "athlete" };
}

export type QuickExercise = { id: string; name: string; times: number; isNew?: boolean };

/** Exercises this client has done: sessions per exercise and when last. */
async function history(clientId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; n: bigint; last: Date }>>(Prisma.sql`
    select s."exerciseId" id, count(distinct s."workoutLogId") n, max(l.date) last
    from "SetLog" s join "WorkoutLog" l on l.id = s."workoutLogId"
    where l."clientId" = ${clientId} and s."exerciseId" is not null
    group by 1`);
  const ex = await prisma.exercise.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, name: true, slug: true, workspaceId: true, movementPattern: true, equipment: true } });
  const byId = new Map(ex.map((e) => [e.id, e]));
  return rows
    .filter((r) => byId.has(r.id))
    .map((r) => {
      const e = byId.get(r.id)!;
      return { id: r.id, name: displayName(e.slug, e.name), times: Number(r.n), last: r.last, isNew: isTypedNew(e) };
    });
}

/** A name typed as is, saved before step 4's matching: private, with placeholder details. */
const isTypedNew = (e: { workspaceId: string | null; movementPattern: string; equipment: string }) =>
  e.workspaceId != null && e.movementPattern === "LOCOMOTION" && e.equipment === "other";

/** What the screen opens with: this client's most recent exercises. */
export async function quickLogStart(raw: { clientId?: string | null }): Promise<{ recent: QuickExercise[] }> {
  const scope = await scopeFor(raw.clientId);
  const done = await history(scope.clientId);
  const recent = done.sort((a, b) => b.last.getTime() - a.last.getTime()).slice(0, 8);
  return { recent: recent.map(({ id, name, times, isNew }) => ({ id, name, times, isNew })) };
}

/** Typed search: this client's exercises first (most done), then the library. */
export async function searchQuickExercises(raw: { clientId?: string | null; q: string }): Promise<QuickExercise[]> {
  const scope = await scopeFor(raw.clientId);
  const tokens = searchTokens(z.string().max(80).parse(raw.q));
  if (tokens.length === 0 || tokens.join("").length < 2) return [];
  const mine = (await history(scope.clientId)).filter((e) => matchesTokens(e.name, tokens)).sort((a, b) => b.times - a.times).slice(0, 6);
  const seen = new Set(mine.map((e) => e.id));
  const names = new Set(mine.map((e) => e.name.toLowerCase()));
  const library = await prisma.exercise.findMany({
    where: {
      // "atlas-" rows are the plan generator's catalog: near-duplicates of the library's own.
      NOT: { slug: { startsWith: "atlas-" } },
      OR: [{ workspaceId: null }, { workspaceId: scope.workspaceId }],
      AND: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })),
      id: { notIn: Array.from(seen) },
    },
    select: { id: true, name: true, slug: true, workspaceId: true, movementPattern: true, equipment: true },
    orderBy: { name: "asc" },
    take: 25,
  });
  const lib = library
    .map((e) => ({ id: e.id, name: displayName(e.slug, e.name), times: 0, isNew: isTypedNew(e) }))
    // Not spreadsheet-labelled copies ("3A One-Arm Dumbbell Row") or names already listed.
    .filter((e) => !/^\d+[A-Z]?\s/.test(e.name) && !names.has(e.name.toLowerCase()))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, 12 - mine.length);
  return [...mine.map(({ id, name, times, isNew }) => ({ id, name, times, isNew })), ...lib];
}

/** The last session this client did this exercise in (plan or not): its sets, for prefill. */
export async function lastTime(raw: { clientId?: string | null; exerciseId: string }): Promise<LastTime | null> {
  const scope = await scopeFor(raw.clientId);
  const exerciseId = Ref.parse(raw.exerciseId);
  const latest = await prisma.setLog.findFirst({
    where: { exerciseId, completed: true, workoutLog: { clientId: scope.clientId } },
    orderBy: [{ workoutLog: { date: "desc" } }, { createdAt: "desc" }],
    select: { workoutLogId: true, workoutLog: { select: { date: true } } },
  });
  if (!latest) return null;
  const sets = await prisma.setLog.findMany({
    where: { workoutLogId: latest.workoutLogId, exerciseId, completed: true },
    orderBy: { setNumber: "asc" },
    select: { weight: true, reps: true, bandColor: true, assignedWorkoutExercise: { select: { prescribedSets: true } } },
  });
  // Seconds, not reps, when the plan it came from said so (planks, carries).
  const rx = sets.find((s) => s.assignedWorkoutExercise)?.assignedWorkoutExercise?.prescribedSets;
  const unit = Array.isArray(rx) && (rx[0] as { unit?: string } | undefined)?.unit === "secs" ? "secs" : "reps";
  return {
    date: latest.workoutLog.date.toISOString(),
    unit,
    sets: sets.map((s): QuickSet => ({ weight: s.weight, reps: s.reps, band: (s.bandColor as QuickSet["band"]) ?? null })),
  };
}

/** An off-plan session to edit, in the screen's shape. */
export async function loadQuickSession(raw: { clientId?: string | null; sessionId: string }) {
  const scope = await scopeFor(raw.clientId);
  const s = await prisma.workoutLog.findFirst({
    where: { id: Ref.parse(raw.sessionId), clientId: scope.clientId, source: "OFF_PLAN" },
    select: {
      id: true, date: true, title: true, clientNotes: true, durationMin: true,
      sets: { orderBy: [{ createdAt: "asc" }, { setNumber: "asc" }], select: { exerciseId: true, weight: true, reps: true, bandColor: true, exercise: { select: { name: true, slug: true, workspaceId: true, movementPattern: true, equipment: true } } } },
    },
  });
  if (!s) return null;
  const exercises: Array<{ exerciseId: string; name: string; isNew: boolean; sets: QuickSet[] }> = [];
  for (const set of s.sets) {
    if (!set.exerciseId || !set.exercise) continue;
    let e = exercises.find((x) => x.exerciseId === set.exerciseId);
    if (!e) exercises.push((e = { exerciseId: set.exerciseId, name: displayName(set.exercise.slug, set.exercise.name), isNew: isTypedNew(set.exercise), sets: [] }));
    e.sets.push({ weight: set.weight, reps: set.reps, band: (set.bandColor as QuickSet["band"]) ?? null });
  }
  return { id: s.id, date: s.date.toISOString(), title: s.title, notes: s.clientNotes, durationMin: s.durationMin, exercises };
}

/** A typed name: the library's exercise of exactly that name if there is one, else a new private one. */
async function exerciseForName(name: string, workspaceId: string, tx: Prisma.TransactionClient): Promise<string> {
  const same = await tx.exercise.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, OR: [{ workspaceId: null }, { workspaceId }] },
    orderBy: { workspaceId: "asc" }, // the shared one first
    select: { id: true },
  });
  if (same) return same.id;
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now()}`;
  const created = await tx.exercise.create({
    // Placeholders: step 4's matching fills in the real details (or merges it into the library's).
    data: { workspaceId, name, slug, movementPattern: MovementPattern.LOCOMOTION, equipment: "other", primaryMuscles: [], secondaryMuscles: [], instructions: [] },
    select: { id: true },
  });
  return created.id;
}

export type QuickSaveResult = { ok: true; sessionId: string } | { ok: false; error: string };

/** Save (or replace) an off-plan session: one finished session with its sets. */
export async function saveQuickSession(raw: unknown): Promise<QuickSaveResult> {
  const parsed = QuickSessionInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Something in that workout doesn't look right. Check the numbers and try again." };
  const input = parsed.data;
  const scope = await scopeFor(input.clientId);
  const clean = cleanSession(input);
  if (clean.totalSets === 0) return { ok: false, error: "Add reps to at least one set." };

  const date = requestDay(input.date);
  if (date.getTime() > Date.now() + 36 * 3_600_000) return { ok: false, error: "That date is in the future." };

  // Library exercises must be ones this client can see.
  const ids = clean.exercises.map((e) => e.exerciseId).filter((id): id is string => id != null);
  const visible = await prisma.exercise.count({ where: { id: { in: ids }, OR: [{ workspaceId: null }, { workspaceId: scope.workspaceId }] } });
  if (visible !== new Set(ids).size) return { ok: false, error: "One of those exercises isn't available. Remove it and add it again." };

  const sessionId = await prisma.$transaction(
    async (tx) => {
      let id = input.sessionId ?? null;
      const fields = { date, title: clean.title, clientNotes: clean.notes, durationMin: clean.durationMin };
      if (id) {
        const existing = await tx.workoutLog.findFirst({ where: { id, clientId: scope.clientId, source: "OFF_PLAN" }, select: { id: true } });
        if (!existing) throw new Error("not_found");
        await tx.setLog.deleteMany({ where: { workoutLogId: id } });
        await tx.workoutLog.update({ where: { id }, data: fields });
      } else {
        const created = await tx.workoutLog.create({
          data: {
            clientId: scope.clientId,
            source: "OFF_PLAN",
            ...fields,
            completedAt: new Date(),
            // A coach's own entry needs no review; an athlete's shows as new for their coach.
            trainerSeen: scope.by === "coach",
          },
          select: { id: true },
        });
        id = created.id;
      }
      const at = Date.now();
      const rows: Prisma.SetLogCreateManyInput[] = [];
      for (let i = 0; i < clean.exercises.length; i++) {
        const e = clean.exercises[i];
        const exerciseId = e.exerciseId ?? (await exerciseForName(e.name, scope.workspaceId, tx));
        e.sets.forEach((s, k) =>
          rows.push({ workoutLogId: id!, exerciseId, setNumber: k + 1, weight: s.weight, reps: s.reps, bandColor: s.band, completed: true, createdAt: new Date(at + i * 1000 + k) })
        );
      }
      await tx.setLog.createMany({ data: rows });
      await tx.clientProfile.update({ where: { id: scope.clientId }, data: { lastContactAt: new Date() } });
      return id!;
    },
    { timeout: 20_000, maxWait: 10_000 }
  ).catch((err: unknown) => {
    if (err instanceof Error && err.message === "not_found") return null;
    throw err;
  });
  if (!sessionId) return { ok: false, error: "That session can't be edited here." };

  checkSessionMilestones(scope.workspaceId, scope.clientId).catch((err: unknown) => console.error("[milestones] session check:", err));
  if (scope.by === "coach") {
    revalidatePath(`/clients/${scope.clientId}`);
  } else {
    for (const p of ["/today", "/plan", "/progress"]) revalidatePath(p);
  }
  return { ok: true, sessionId };
}
