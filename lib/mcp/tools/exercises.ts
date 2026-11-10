import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { displayName } from "@/lib/plan/catalog";
import { ALL_ROLES } from "../auth";
import { MOVEMENT_PATTERNS } from "../schemas";
import { workspaceTool } from "../tool";

export const searchExercises = workspaceTool({
  name: "search_exercises",
  title: "Search exercises",
  description: "Search the exercise library: the shared global library plus any exercises private to the caller's workspace.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({
    query: z.string().trim().max(80).optional(),
    movementPattern: z.enum(MOVEMENT_PATTERNS).optional(),
    equipment: z.string().trim().max(40).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async handler({ caller }, args) {
    const exercises = await prisma.exercise.findMany({
      where: {
        // Global library (workspaceId null) is readable by everyone; anything else must be the caller's own.
        OR: [{ workspaceId: null }, { workspaceId: caller.workspaceId }],
        ...(args.query && { name: { contains: args.query, mode: "insensitive" } }),
        ...(args.movementPattern && { movementPattern: args.movementPattern }),
        ...(args.equipment && { equipment: { contains: args.equipment, mode: "insensitive" } }),
      },
      orderBy: { name: "asc" },
      take: args.limit,
      select: { id: true, name: true, slug: true, movementPattern: true, equipment: true, primaryMuscles: true },
    });
    return {
      exercises: exercises.map((e) => ({
        id: e.id,
        name: displayName(e.slug, e.name),
        movementPattern: e.movementPattern,
        equipment: e.equipment,
        primaryMuscles: e.primaryMuscles,
      })),
    };
  },
});
