"use server";

/**
 * The coach's side of the one plan model: generate a plan for a client,
 * review and edit it, assign it. Every edit goes through lib/plan/edit.ts,
 * the same functions the athlete's Plan screen and the MCP tools use.
 *
 * A draft is a plan with status PAUSED: built and editable, but not the
 * client's live plan until the coach assigns it.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { assignProgram } from "@/lib/db/programs";
import { normalizePrefs } from "@/lib/plan/generator";
import { createPlanForClient, ensureCatalog } from "@/lib/plan/persist";
import {
  LIMITS,
  PlanEditError,
  addExercise,
  addWorkout,
  removeExercise,
  removeWorkout,
  setPlanNote,
  setTargets,
  setWorkoutNote,
  swapExercise,
  type PlanScope,
} from "@/lib/plan/edit";

export type CoachResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const DAY_MS = 86_400_000;
const Ref = z.string().min(1).max(64);
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function requireCoach() {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!session?.user?.id || !workspaceId || session.user.role === "CLIENT") throw new Error("Unauthorized");
  return { workspaceId, userId: session.user.id };
}

/** The client must be in the coach's workspace; the plan, when named, must be that client's. */
async function scopeFor(clientId: string, assignmentId?: string): Promise<PlanScope> {
  const { workspaceId } = await requireCoach();
  const client = await prisma.clientProfile.findFirst({ where: { id: Ref.parse(clientId), workspaceId, deletedAt: null }, select: { id: true } });
  if (!client) throw new PlanEditError("not_found", "That client isn't in your workspace.");
  if (assignmentId) {
    const plan = await prisma.programAssignment.findFirst({ where: { id: Ref.parse(assignmentId), clientId, workspaceId }, select: { id: true } });
    if (!plan) throw new PlanEditError("not_found", "That plan isn't one of this client's.");
  }
  return { clientId, workspaceId, assignmentId };
}

function refresh(clientId: string, assignmentId?: string) {
  revalidatePath("/programs");
  revalidatePath(`/clients/${clientId}`);
  if (assignmentId) revalidatePath(`/clients/${clientId}/programs/${assignmentId}`);
  // The athlete sees the same plan.
  revalidatePath("/today");
  revalidatePath("/plan");
}

async function run<T extends object>(fn: () => Promise<T | void>): Promise<CoachResult<T>> {
  try {
    return { ok: true, ...((await fn()) ?? ({} as T)) };
  } catch (err) {
    if (err instanceof PlanEditError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: "That doesn't look right. Check the values and try again." };
    console.error("[coach plan]", err);
    return { ok: false, error: "Couldn't save that change. Please try again." };
  }
}

// ── Editing (bound to one client and one plan by the page) ───────────────────

const Targets = z.object({
  sets: z.number().int().min(1).max(LIMITS.sets).optional(),
  repMin: z.number().int().min(1).max(LIMITS.seconds).optional(),
  repMax: z.number().int().min(1).max(LIMITS.seconds).optional(),
  weight: z.number().min(0).max(LIMITS.weight).nullable().optional(),
});

export async function coachAddWorkout(clientId: string, assignmentId: string, raw: { week: number; name: string; copyFromWorkoutId?: string }) {
  return run(async () => {
    const input = z.object({ week: z.number().int().min(1).max(52), name: z.string().max(200), copyFromWorkoutId: Ref.optional() }).parse(raw);
    const result = await addWorkout(await scopeFor(clientId, assignmentId), input);
    refresh(clientId, assignmentId);
    return result;
  });
}

export async function coachRemoveWorkout(clientId: string, assignmentId: string, workoutId: string) {
  return run(async () => {
    await removeWorkout(await scopeFor(clientId, assignmentId), Ref.parse(workoutId));
    refresh(clientId, assignmentId);
  });
}

export async function coachAddExercise(clientId: string, assignmentId: string, raw: { workoutId: string; slug: string } & z.input<typeof Targets>) {
  return run(async () => {
    const input = Targets.extend({ workoutId: Ref, slug: Ref }).parse(raw);
    const result = await addExercise(await scopeFor(clientId, assignmentId), input);
    refresh(clientId, assignmentId);
    return result;
  });
}

export async function coachRemoveExercise(clientId: string, assignmentId: string, raw: { aweId: string; workoutId: string }) {
  return run(async () => {
    const input = z.object({ aweId: Ref, workoutId: Ref }).parse(raw);
    await removeExercise(await scopeFor(clientId, assignmentId), input.aweId);
    refresh(clientId, assignmentId);
  });
}

export async function coachSwapExercise(clientId: string, assignmentId: string, raw: { aweId: string; workoutId: string; slug: string }) {
  return run(async () => {
    const input = z.object({ aweId: Ref, workoutId: Ref, slug: Ref }).parse(raw);
    await swapExercise(await scopeFor(clientId, assignmentId), input);
    refresh(clientId, assignmentId);
  });
}

export async function coachSetTargets(clientId: string, assignmentId: string, raw: { aweId: string; workoutId: string } & z.input<typeof Targets>) {
  return run(async () => {
    const input = Targets.extend({ aweId: Ref, workoutId: Ref }).parse(raw);
    await setTargets(await scopeFor(clientId, assignmentId), input);
    refresh(clientId, assignmentId);
  });
}

export async function coachSetWorkoutNote(clientId: string, assignmentId: string, raw: { workoutId: string; text: string }) {
  return run(async () => {
    const input = z.object({ workoutId: Ref, text: z.string().max(LIMITS.note * 2) }).parse(raw);
    await setWorkoutNote(await scopeFor(clientId, assignmentId), input.workoutId, input.text);
    refresh(clientId, assignmentId);
  });
}

export async function coachSetPlanNote(clientId: string, assignmentId: string, text: string) {
  return run(async () => {
    await setPlanNote(await scopeFor(clientId, assignmentId), z.string().max(LIMITS.note * 2).parse(text));
    refresh(clientId, assignmentId);
  });
}

// ── Generate, assign, discard ─────────────────────────────────────────────────

/** Generate a plan for a client with the same generator the athlete uses. It starts as a draft. */
export async function generateDraftPlan(raw: { clientId: string; prefs: unknown; startDate: string }): Promise<CoachResult<{ assignmentId: string }>> {
  return run(async () => {
    const input = z.object({ clientId: Ref, prefs: z.unknown(), startDate: IsoDay }).parse(raw);
    const scope = await scopeFor(input.clientId);
    await ensureCatalog();
    const prefs = normalizePrefs(input.prefs);
    const { assignmentId } = await prisma.$transaction(
      (tx) => createPlanForClient({ workspaceId: scope.workspaceId, clientId: scope.clientId, prefs, startDate: new Date(`${input.startDate}T00:00:00`), draft: true }, tx),
      { timeout: 20_000, maxWait: 10_000 }
    );
    refresh(scope.clientId, assignmentId);
    return { assignmentId };
  });
}

/** Start a draft from one of the coach's library programs, exactly as written. */
export async function draftFromTemplate(raw: { programId: string; clientId: string; startDate: string }): Promise<CoachResult<{ assignmentId: string }>> {
  return run(async () => {
    const input = z.object({ programId: Ref, clientId: Ref, startDate: IsoDay }).parse(raw);
    const scope = await scopeFor(input.clientId);
    const assignment = await assignProgram(scope.workspaceId, input.programId, scope.clientId, new Date(`${input.startDate}T00:00:00`));
    // assignProgram makes a live plan; hold it as a draft until the coach assigns it.
    await prisma.programAssignment.update({ where: { id: assignment.id }, data: { status: "PAUSED" } });
    refresh(scope.clientId, assignment.id);
    return { assignmentId: assignment.id };
  });
}

/**
 * Make a draft the client's live plan. The plan's dates move to the chosen
 * start; any plan that was live is completed (its logged history stays).
 */
export async function assignDraftPlan(raw: { clientId: string; assignmentId: string; startDate: string }): Promise<CoachResult> {
  return run(async () => {
    const input = z.object({ clientId: Ref, assignmentId: Ref, startDate: IsoDay }).parse(raw);
    const scope = await scopeFor(input.clientId, input.assignmentId);
    const draft = await prisma.programAssignment.findFirst({
      where: { id: input.assignmentId, clientId: scope.clientId, workspaceId: scope.workspaceId, status: "PAUSED" },
      select: { id: true, startDate: true, sourceProgramId: true, assignedWorkouts: { select: { id: true, scheduledDate: true } } },
    });
    if (!draft) throw new PlanEditError("not_found", "That draft has already been assigned or removed.");

    const start = new Date(`${input.startDate}T00:00:00`);
    const shiftDays = Math.round((start.getTime() - draft.startDate.getTime()) / DAY_MS);

    await prisma.$transaction(async (tx) => {
      await tx.programAssignment.updateMany({ where: { clientId: scope.clientId, workspaceId: scope.workspaceId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
      if (shiftDays !== 0) {
        for (const w of draft.assignedWorkouts) {
          const d = new Date(w.scheduledDate);
          d.setDate(d.getDate() + shiftDays);
          await tx.assignedWorkout.update({ where: { id: w.id }, data: { scheduledDate: d } });
        }
      }
      await tx.programAssignment.update({ where: { id: draft.id }, data: { status: "ACTIVE", startDate: start } });
      await tx.program.updateMany({ where: { id: draft.sourceProgramId, workspaceId: scope.workspaceId, isDraft: true }, data: { isDraft: false } });
    });
    refresh(scope.clientId, draft.id);
  });
}

/** Throw away a draft that was never assigned. Live plans can't be discarded here. */
export async function discardDraftPlan(raw: { clientId: string; assignmentId: string }): Promise<CoachResult> {
  return run(async () => {
    const input = z.object({ clientId: Ref, assignmentId: Ref }).parse(raw);
    const scope = await scopeFor(input.clientId, input.assignmentId);
    const draft = await prisma.programAssignment.findFirst({
      where: { id: input.assignmentId, clientId: scope.clientId, workspaceId: scope.workspaceId, status: "PAUSED" },
      select: { id: true, sourceProgram: { select: { id: true, isTemplate: true, _count: { select: { assignments: true } } } } },
    });
    if (!draft) throw new PlanEditError("not_found", "Only an unassigned draft can be discarded.");
    await prisma.$transaction(async (tx) => {
      await tx.programAssignment.delete({ where: { id: draft.id } });
      // A program generated for this draft alone goes with it; a library program stays.
      if (!draft.sourceProgram.isTemplate && draft.sourceProgram._count.assignments === 1) {
        await tx.program.delete({ where: { id: draft.sourceProgram.id } });
      }
    });
    refresh(scope.clientId);
  });
}
