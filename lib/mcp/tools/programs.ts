import { z } from "zod";
import { isLighterWeek, lighterWeeksOn } from "@/lib/plan/lighter";
import { prisma } from "@/lib/db/client";
import { getClient } from "@/lib/db/clients";
import { getTrainer } from "@/lib/db/trainer";
import { callAI, MODELS } from "@/lib/ai/client";
import { loadMethodology } from "@/lib/ai/methodology-loader";
import { buildProgramPrompt } from "@/lib/ai/prompts/program";
import { displayName } from "@/lib/plan/catalog";
import { iso, weekOf } from "@/lib/athlete/sessions";
import { ALL_ROLES, COACH_ROLES } from "../auth";
import { notFound, rateLimited } from "../context";
import { describePrescription, loadActiveAssignment } from "../data";
import { ClientIdArg } from "../schemas";
import { clientTool } from "../tool";

const GENERATIONS_PER_WORKSPACE_PER_HOUR = 10;

export const getActiveProgram = clientTool({
  name: "get_active_program",
  title: "Active program",
  description:
    "The client's current plan: where they are in it, the next workout, and every workout in one week (this week by default) with its exercises and targets. Returns the ids the plan-editing tools take: assignedWorkoutId for a workout, planExerciseId for an exercise in it.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, week: z.number().int().min(1).max(52).optional().describe("Which week to list. Defaults to the current week.") }),
  async handler({ client }, args) {
    const assignment = await loadActiveAssignment(client);
    if (!assignment) return { client: client.fullName, program: null };

    const start = assignment.startDate.getTime();
    const workouts = assignment.assignedWorkouts.map((w) => ({
      assignedWorkoutId: w.id,
      name: w.name,
      week: weekOf(w.scheduledDate.getTime(), start),
      lighterWeek: isLighterWeek(w.scheduledDate, assignment, client.selfServe),
      scheduledDate: iso(w.scheduledDate),
      status: w.status,
      note: w.notes,
      exercises: w.exercises.map((e) => {
        const rx = describePrescription(e.prescribedSets);
        const weight = (Array.isArray(e.prescribedSets) ? (e.prescribedSets[0] as { weight?: number | null } | undefined)?.weight : null) ?? null;
        return {
          planExerciseId: e.id,
          exerciseId: e.exerciseId,
          exercise: displayName(e.exercise.slug, e.exercise.name),
          sets: rx.sets,
          reps: rx.reps,
          targetWeightLb: weight,
        };
      }),
    }));
    const next = workouts.find((w) => w.status === "PLANNED") ?? null;
    const totalWeeks = workouts.reduce((m, w) => Math.max(m, w.week), 1);
    const currentWeek = next?.week ?? totalWeeks;

    return {
      client: client.fullName,
      program: {
        assignmentId: assignment.id,
        programId: assignment.sourceProgramId,
        name: assignment.name,
        goal: assignment.goalText,
        note: assignment.notes,
        lighterWeeks: lighterWeeksOn(assignment, client.selfServe),
        startDate: iso(assignment.startDate),
        totalWeeks,
        currentWeek,
        workoutsLogged: workouts.filter((w) => w.status === "LOGGED").length,
        workoutsTotal: workouts.length,
        nextWorkout: next,
        week: args.week ?? currentWeek,
        workouts: workouts.filter((w) => w.week === (args.week ?? currentWeek)),
      },
    };
  },
});

export const generateProgram = clientTool({
  name: "generate_program",
  title: "Generate a program proposal",
  description:
    "Draft a program for a client with the coach's methodology and the client's intake. Returns a written proposal only; nothing is saved. To change the client's actual plan, use edit_plan.",
  permission: "generate",
  roles: COACH_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    goal: z.string().trim().min(2).max(200),
    durationWeeks: z.number().int().min(1).max(52),
    sessionsPerWeek: z.number().int().min(1).max(7),
    sessionLength: z.number().int().min(15).max(180).describe("Minutes per session."),
    equipment: z.string().trim().min(2).max(200),
    notes: z.string().trim().max(2000).optional(),
  }),
  async handler({ client, caller }, args) {
    // The only tool that spends money: cap it per workspace on top of the usage log.
    const recent = await prisma.usageLog.count({
      where: { workspaceId: caller.workspaceId, feature: "program-generate", createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= GENERATIONS_PER_WORKSPACE_PER_HOUR) {
      throw rateLimited(`This workspace has generated ${recent} programs in the last hour. Try again later.`);
    }

    const [full, trainer, methodology] = await Promise.all([
      getClient(client.id, caller.workspaceId),
      getTrainer(caller.workspaceId, caller.userId),
      loadMethodology(caller.workspaceId, "program"),
    ]);
    if (!full) throw notFound();

    const { system, user } = buildProgramPrompt({
      clientName: full.fullName,
      clientSummary: full.intakeForms?.find((f) => f.sourceType !== "csv-import")?.aiSummary ?? null,
      goal: args.goal,
      durationWeeks: args.durationWeeks,
      sessionsPerWeek: args.sessionsPerWeek,
      sessionLength: args.sessionLength,
      equipment: args.equipment,
      notes: args.notes,
      trainerVoice: trainer?.voice ?? null,
      trainerName: trainer?.name ?? null,
      methodology,
    });

    const result = await callAI({
      system,
      user,
      model: MODELS.sonnet,
      maxTokens: 4096,
      feature: "program-generate",
      workspaceId: caller.workspaceId,
      userId: caller.userId,
    });

    return {
      client: client.fullName,
      saved: false,
      proposal: result.content,
      next: "Review the proposal with the coach. To apply parts of it, change the client's plan with edit_plan.",
    };
  },
});

