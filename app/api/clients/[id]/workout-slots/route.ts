import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

/**
 * GET /api/clients/[id]/workout-slots
 *
 * Returns all assigned workout slots for a client's active program assignments,
 * enriched with a computed weekNumber so the UI can display "Week 3 — Day 1".
 */
export const GET = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id: clientId } = await params;

    const assignments = await prisma.programAssignment.findMany({
      where: { clientId, workspaceId, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
      include: {
        assignedWorkouts: {
          orderBy: { scheduledDate: "asc" },
          include: { workoutLog: { select: { id: true } } },
        },
      },
    });

    const slots = assignments.flatMap((a) => {
      const startMs = new Date(a.startDate).getTime();
      return a.assignedWorkouts.map((w) => {
        const weekNumber =
          Math.floor(
            (new Date(w.scheduledDate).getTime() - startMs) /
              (7 * 24 * 60 * 60 * 1000)
          ) + 1;
        return {
          assignmentId: a.id,
          assignmentName: a.name,
          workoutId: w.id,
          workoutName: w.name,
          scheduledDate: w.scheduledDate.toISOString(),
          weekNumber: Math.max(1, weekNumber),
          status: w.status,
          logId: w.workoutLog?.id ?? null,
        };
      });
    });

    return NextResponse.json(slots);
  }
);
