/**
 * Editing the client's own plan — the same functions the Plan screen, the
 * workout logger and the coach's editor call (lib/plan/edit.ts).
 *
 * Open to athletes as well as coaches: an athlete edits their own plan, a
 * coach edits any client's plan in their workspace. Scoping is the pipeline's
 * job (lib/mcp/tool.ts) and then edit.ts puts the client and workspace in
 * every query, so a workout or exercise id from anyone else's plan is
 * "not found".
 */

import { z } from "zod";
import { CATALOG_BY_SLUG } from "@/lib/plan/catalog";
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
import { ALL_ROLES } from "../auth";
import { invalid, notFound, type ScopedClient } from "../context";
import { ClientIdArg, Id } from "../schemas";
import { clientTool } from "../tool";

const scopeOf = (client: ScopedClient): PlanScope => ({ clientId: client.id, workspaceId: client.workspaceId });

/** Turn the editor's refusals into the pipeline's: 404 for anything out of scope, 400 for bad input. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PlanEditError) throw err.kind === "not_found" ? notFound() : invalid(err.message);
    throw err;
  }
}

// Tool inputs must be plain objects (the SDK advertises their JSON Schema), so
// these are shapes spread into each input rather than composed schemas.
const exerciseRef = {
  exerciseId: Id.optional().describe("An exercise id from search_exercises."),
  slug: z.string().max(80).optional().describe("Or one of Atlas's own exercise slugs."),
};

/** One of the two ways to name an exercise, checked before anything is written. */
function exerciseOf(args: { exerciseId?: string; slug?: string }) {
  if (args.exerciseId) return { exerciseId: args.exerciseId };
  if (args.slug && CATALOG_BY_SLUG[args.slug]) return { slug: args.slug };
  throw invalid("Give an exerciseId (from search_exercises) or a known slug.");
}

// Training values proposed by an AI client are coerced into range, not rejected (as in SetSchema).
const targets = {
  sets: z.number().int().min(1).max(LIMITS.sets).optional().catch(undefined),
  repMin: z.number().int().min(1).max(LIMITS.seconds).optional().catch(undefined),
  repMax: z.number().int().min(1).max(LIMITS.seconds).optional().catch(undefined),
  weightLb: z.number().min(0).max(LIMITS.weight).nullable().optional().catch(undefined).describe("Target weight. null clears it so Atlas works it out from the last session."),
};

const fromTargets = (t: { sets?: number; repMin?: number; repMax?: number; weightLb?: number | null }) => ({ sets: t.sets, repMin: t.repMin, repMax: t.repMax, ...(t.weightLb !== undefined && { weight: t.weightLb }) });

export const addPlanWorkout = clientTool({
  name: "add_plan_workout",
  title: "Add a workout to the plan",
  description: "Add a workout to one week of the client's active plan, on the first free day. Starts empty, or as a copy of another workout in the plan.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    week: z.number().int().min(1).max(52),
    name: z.string().trim().min(1).max(LIMITS.name),
    copyFromWorkoutId: Id.optional().describe("An assignedWorkoutId from get_active_program to copy."),
  }),
  async handler({ client }, args) {
    const { workoutId } = await run(() => addWorkout(scopeOf(client), args));
    return { assignedWorkoutId: workoutId, week: args.week, name: args.name };
  },
});

export const removePlanWorkout = clientTool({
  name: "remove_plan_workout",
  title: "Remove a workout from the plan",
  description: "Take a workout out of the client's plan. Anything already logged in it is kept in their history and charts.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, assignedWorkoutId: Id }),
  async handler({ client }, args) {
    await run(() => removeWorkout(scopeOf(client), args.assignedWorkoutId));
    return { removed: args.assignedWorkoutId };
  },
});

export const addPlanExercise = clientTool({
  name: "add_plan_exercise",
  title: "Add an exercise to a workout",
  description: "Add an exercise to one workout in the client's plan, with optional targets.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, assignedWorkoutId: Id, ...exerciseRef, ...targets }),
  async handler({ client }, args) {
    const { aweId } = await run(() => addExercise(scopeOf(client), { workoutId: args.assignedWorkoutId, ...exerciseOf(args), ...fromTargets(args) }));
    return { planExerciseId: aweId, assignedWorkoutId: args.assignedWorkoutId };
  },
});

export const removePlanExercise = clientTool({
  name: "remove_plan_exercise",
  title: "Remove an exercise from a workout",
  description: "Remove one exercise from one workout in the client's plan. Sets already logged for it stay in the history.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, planExerciseId: Id }),
  async handler({ client }, args) {
    await run(() => removeExercise(scopeOf(client), args.planExerciseId));
    return { removed: args.planExerciseId };
  },
});

export const swapPlanExercise = clientTool({
  name: "swap_plan_exercise",
  title: "Swap an exercise",
  description: "Replace one exercise in one workout with another. The set count and rep range carry over; the target weight resets. Sets already logged stay with the exercise they were done on.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, planExerciseId: Id, ...exerciseRef }),
  async handler({ client }, args) {
    await run(() => swapExercise(scopeOf(client), { aweId: args.planExerciseId, ...exerciseOf(args) }));
    return { planExerciseId: args.planExerciseId, swapped: true };
  },
});

export const setPlanExerciseTargets = clientTool({
  name: "set_plan_exercise_targets",
  title: "Set an exercise's targets",
  description: "Change the sets, rep range or target weight of one exercise in one workout. Logged sets still drive the next session's suggestion.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, planExerciseId: Id, ...targets }),
  async handler({ client }, args) {
    await run(() => setTargets(scopeOf(client), { aweId: args.planExerciseId, ...fromTargets(args) }));
    return { planExerciseId: args.planExerciseId, updated: true };
  },
});

export const setPlanNotes = clientTool({
  name: "set_plan_note",
  title: "Write a note on the plan or a workout",
  description: "Write (or clear, with an empty string) the note on the client's whole plan, or on one workout when assignedWorkoutId is given. Notes show every time the plan is opened.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    assignedWorkoutId: Id.optional().describe("Leave out to write the note on the plan as a whole."),
    text: z.string().max(LIMITS.note),
  }),
  async handler({ client }, args) {
    const scope = scopeOf(client);
    await run(() => (args.assignedWorkoutId ? setWorkoutNote(scope, args.assignedWorkoutId, args.text) : setPlanNote(scope, args.text)));
    return { on: args.assignedWorkoutId ?? "plan", cleared: args.text.trim() === "" };
  },
});
