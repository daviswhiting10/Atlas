import { z } from "zod";
import { isLighterWeek, lighterWeeksOn } from "@/lib/plan/lighter";
import { prisma } from "@/lib/db/client";
import { getProgram, upsertProgram } from "@/lib/db/programs";
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
import { ClientIdArg, Id, ProgramBodySchema } from "../schemas";
import { clientTool, workspaceTool } from "../tool";

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

export const getProgramDetails = workspaceTool({
  name: "get_program_details",
  title: "Program details",
  description:
    "Structure of a program: blocks, phases, workouts and prescriptions. Coaches can read any program in their workspace; athletes only a program assigned to them.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({ programId: Id }),
  async handler({ caller }, args) {
    // An athlete may only see a program they have been assigned. Anything else is "not found".
    if (caller.role === "CLIENT") {
      const assigned = caller.clientProfileId
        ? await prisma.programAssignment.findFirst({
            where: { sourceProgramId: args.programId, clientId: caller.clientProfileId, workspaceId: caller.workspaceId },
            select: { id: true },
          })
        : null;
      if (!assigned) throw notFound();
    }

    const program = await getProgram(args.programId, caller.workspaceId);
    if (!program) throw notFound();

    return {
      id: program.id,
      name: program.name,
      description: program.description,
      durationWeeks: program.durationWeeks,
      goalTags: program.goalTags,
      isDraft: program.isDraft,
      blocks: program.blocks.map((b) => ({
        id: b.id,
        name: b.name,
        order: b.order,
        weeks: b.weeks,
        phase: b.phase,
        workouts: b.workouts.map((w) => ({
          id: w.id,
          name: w.name,
          dayOfWeek: w.dayOfWeek,
          exercises: w.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            exercise: e.exercise.name,
            section: e.section,
            notes: e.notes,
            prescribedSets: e.prescribedSets,
          })),
        })),
      })),
      note:
        program.blocks.every((b) => b.workouts.length === 0)
          ? "This program was generated for one athlete; its week-by-week workouts are on the assignment. Use get_active_program."
          : null,
    };
  },
});

export const generateProgram = clientTool({
  name: "generate_program",
  title: "Generate a program proposal",
  description:
    "Draft a program for a client with the coach's methodology and the client's intake. Returns a proposal only — nothing is saved until save_program is called.",
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
      next: "Review the proposal with the coach. To keep it, build a program body and call save_program.",
    };
  },
});

export const saveProgram = workspaceTool({
  name: "save_program",
  title: "Save a program",
  description: "Create a program in the coach's library. Saved as a draft unless isDraft is false. Does not assign it to anyone.",
  permission: "write",
  roles: COACH_ROLES,
  input: z.object({
    program: ProgramBodySchema,
    isDraft: z.boolean().default(true).describe("Drafts stay out of the assignable library until published."),
  }),
  async handler({ caller }, args) {
    const created = await upsertProgram(caller.workspaceId, args.program);
    if (args.isDraft) {
      await prisma.program.updateMany({ where: { id: created.id, workspaceId: caller.workspaceId }, data: { isDraft: true } });
    }
    return { programId: created.id, name: created.name, durationWeeks: created.durationWeeks, isDraft: args.isDraft };
  },
});

export const updateProgram = workspaceTool({
  name: "update_program",
  title: "Update a program",
  description: "Replace the contents of an existing program in the coach's library. Plans already assigned to clients are snapshots and do not change.",
  permission: "write",
  roles: COACH_ROLES,
  input: z.object({ programId: Id, program: ProgramBodySchema, isDraft: z.boolean().optional() }),
  async handler({ caller }, args) {
    // Scope check before mutating: the program must be in the caller's workspace.
    const existing = await prisma.program.findFirst({
      where: { id: args.programId, workspaceId: caller.workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw notFound();

    const updated = await upsertProgram(caller.workspaceId, args.program, existing.id);
    if (args.isDraft !== undefined) {
      await prisma.program.updateMany({ where: { id: existing.id, workspaceId: caller.workspaceId }, data: { isDraft: args.isDraft } });
    }
    return { programId: updated.id, name: updated.name, durationWeeks: updated.durationWeeks };
  },
});
