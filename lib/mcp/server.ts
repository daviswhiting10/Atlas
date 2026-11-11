/**
 * Builds the MCP server for one caller. The caller is bound here, by
 * closure: tool handlers receive it from this function and never from the
 * arguments an AI client sends.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { AuditSink } from "./audit";
import type { McpCaller, McpTransport } from "./context";
import { lookupClient } from "./data";
import { executeTool, type ToolDef, type ToolDeps, type ToolResult } from "./tool";
import { getExerciseHistory, getWorkoutHistory, logWorkout } from "./tools/workouts";
import { analyzeProgress, detectPlateaus, getPersonalRecords, getTrainingVolume } from "./tools/progress";
import { generateProgram, getActiveProgram, getProgramDetails, saveProgram, updateProgram } from "./tools/programs";
import { searchExercises } from "./tools/exercises";
import { getTrainingRecommendations, getUserFitnessProfile } from "./tools/coaching";
import { addPlanExercise, addPlanWorkout, removePlanExercise, removePlanWorkout, setPlanExerciseTargets, setPlanLighterWeeks, setPlanNotes, swapPlanExercise } from "./tools/plan";

export const TOOLS: ToolDef[] = [
  getWorkoutHistory,
  getExerciseHistory,
  analyzeProgress,
  getPersonalRecords,
  detectPlateaus,
  getTrainingVolume,
  getActiveProgram,
  getProgramDetails,
  generateProgram,
  saveProgram,
  updateProgram,
  searchExercises,
  getTrainingRecommendations,
  getUserFitnessProfile,
  logWorkout,
  addPlanWorkout,
  removePlanWorkout,
  addPlanExercise,
  removePlanExercise,
  swapPlanExercise,
  setPlanExerciseTargets,
  setPlanNotes,
  setPlanLighterWeeks,
];

/** Writes the audit row. A failed write is reported, never thrown: an audit outage must not take the tools down. */
export const prismaAuditSink: AuditSink = async (entry) => {
  await prisma.auditLog.create({ data: entry });
};

export const defaultDeps = (transport: McpTransport): ToolDeps => ({ lookupClient, audit: prismaAuditSink, transport });

/**
 * Advertise a tool's real JSON Schema to clients, but let every call through
 * to our own pipeline. Validation happens there (lib/mcp/tool.ts) so that a
 * malformed call is audit-logged like any other, instead of being rejected
 * by the SDK before we ever see it.
 */
function advertise(schema: z.ZodObject) {
  const jsonSchema = () => z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return {
    "~standard": {
      version: 1 as const,
      vendor: "atlas",
      validate: (value: unknown) => ({ value: (value ?? {}) as Record<string, unknown> }),
      jsonSchema: { input: jsonSchema, output: jsonSchema },
    },
  };
}

const STATUS: Record<Exclude<ToolResult["outcome"], "ok">, string> = {
  validation_error: "400 invalid arguments",
  forbidden: "403 forbidden",
  not_found: "404 not found",
  rate_limited: "429 rate limited",
  error: "500 error",
};

function toCallResult(result: ToolResult) {
  if (result.outcome === "ok") {
    return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
  }
  return { isError: true, content: [{ type: "text" as const, text: `${STATUS[result.outcome]}: ${result.message}` }] };
}

export function createMcpServer(caller: McpCaller, deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: "atlas", version: "1.0.0" },
    {
      instructions:
        caller.role === "CLIENT"
          ? "Atlas training data for one athlete. Every tool acts on the signed-in athlete's own data; clientId can be omitted. You can read the plan and progress, log workouts, and edit the plan itself: add or remove workouts and exercises, swap an exercise, change targets, write notes on the plan or a workout, and turn lighter weeks on or off. Call get_active_program first for the assignedWorkoutId and planExerciseId values those edits take. Edits never delete logged history. Weights are in pounds."
          : "Atlas coaching data for one workspace. Pass clientId to say which client a tool acts on. You can read any client's plan and progress, log workouts, and edit a client's plan (add_plan_workout, add_plan_exercise, swap_plan_exercise, set_plan_exercise_targets, set_plan_note, set_plan_lighter_weeks and the remove tools); get_active_program returns the ids those take. save_program and update_program work on the coach's program library, not on a client's plan. generate_program returns a proposal and saves nothing. Weights are in pounds.",
    }
  );

  for (const def of TOOLS) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: advertise(def.input),
        annotations: {
          readOnlyHint: def.permission !== "write",
          destructiveHint: false,
          idempotentHint: def.permission !== "generate",
          openWorldHint: def.permission === "generate",
        },
      },
      async (args) => toCallResult(await executeTool(def, caller, args, deps))
    );
  }

  registerResources(server, caller, deps);
  return server;
}

// ── Resources ───────────────────────────────────────────────────────────────
// Read-only context an AI client can pull in. Each one runs the matching
// tool through the same pipeline, so scoping and audit logging are identical.

type ResourceSpec = {
  name: string;
  template: string;
  title: string;
  description: string;
  /** Tools to run, in order; their results are merged under these keys. */
  parts: Array<{ key: string; tool: ToolDef }>;
};

const RESOURCES: ResourceSpec[] = [
  {
    name: "client-summary",
    template: "atlas://clients/{clientId}/summary",
    title: "Client summary",
    description: "Profile, goal, status, key lifts and recent milestones.",
    parts: [{ key: "profile", tool: getUserFitnessProfile }],
  },
  {
    name: "client-active-program",
    template: "atlas://clients/{clientId}/program/active",
    title: "Active program",
    description: "The client's current plan with the next and upcoming workouts.",
    parts: [{ key: "activeProgram", tool: getActiveProgram }],
  },
  {
    name: "client-exercise-history",
    template: "atlas://clients/{clientId}/exercises/{exerciseId}/history",
    title: "Exercise history",
    description: "Per-session estimated 1-rep max and set history for one lift.",
    parts: [{ key: "history", tool: getExerciseHistory }],
  },
  {
    name: "client-progress",
    template: "atlas://clients/{clientId}/progress",
    title: "Progress",
    description: "Strength series, weekly volume, body-weight trend and personal records.",
    parts: [
      { key: "progress", tool: analyzeProgress },
      { key: "personalRecords", tool: getPersonalRecords },
    ],
  },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function registerResources(server: McpServer, caller: McpCaller, deps: ToolDeps) {
  for (const spec of RESOURCES) {
    const needsExercise = spec.template.includes("{exerciseId}");
    server.registerResource(
      spec.name,
      new ResourceTemplate(spec.template, {
        // Only list what this caller can actually read. An athlete sees their
        // own resources; a coach discovers clients through the tools instead
        // of having the whole roster enumerated here.
        list:
          caller.role === "CLIENT" && caller.clientProfileId && !needsExercise
            ? async () => ({
                resources: [
                  {
                    uri: spec.template.replace("{clientId}", caller.clientProfileId as string),
                    name: spec.name,
                    title: spec.title,
                    description: spec.description,
                    mimeType: "application/json",
                  },
                ],
              })
            : undefined,
      }),
      { title: spec.title, description: spec.description, mimeType: "application/json" },
      async (uri, variables) => {
        const args = { clientId: one(variables.clientId), ...(needsExercise && { exerciseId: one(variables.exerciseId) }) };
        const merged: Record<string, unknown> = {};
        for (const part of spec.parts) {
          // Audited under its own name so resource reads are distinguishable from tool calls.
          const result = await executeTool({ ...part.tool, name: `resource:${spec.name}:${part.tool.name}` } as ToolDef, caller, args, deps);
          if (result.outcome !== "ok") throw new Error(`${STATUS[result.outcome]}: ${result.message}`);
          merged[part.key] = result.data;
        }
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(merged, null, 2) }] };
      }
    );
  }
}
