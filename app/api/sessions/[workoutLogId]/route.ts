import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

type Ctx = { workoutLogId: string };

// GET /api/sessions/[workoutLogId]
// Returns a WorkoutLog with all sets grouped by exercise
export const GET = withWorkspace<Ctx>(async (_req, { workspaceId }, { params }) => {
  const { workoutLogId } = await params;

  const log = await prisma.workoutLog.findFirst({
    where: {
      id: workoutLogId,
      client: { workspaceId },
    },
    include: {
      client: { select: { id: true, fullName: true } },
      assignedWorkout: {
        select: {
          id: true,
          name: true,
          scheduledDate: true,
          programAssignment: { select: { id: true, name: true } },
        },
      },
      sets: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          exercise: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(log);
});

const PatchSchema = z.object({
  date: z.string().optional(),
  clientNotes: z.string().optional(),
  durationMin: z.number().int().positive().nullable().optional(),
});

// PATCH /api/sessions/[workoutLogId]
// Updates WorkoutLog.date (and syncs AssignedWorkout.scheduledDate if linked)
export const PATCH = withWorkspace<Ctx>(async (req, { workspaceId }, { params }) => {
  const { workoutLogId } = await params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.workoutLog.findFirst({
    where: { id: workoutLogId, client: { workspaceId } },
    select: { id: true, assignedWorkoutId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { date, clientNotes, durationMin } = parsed.data;
  const newDate = date ? new Date(date) : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.workoutLog.update({
      where: { id: workoutLogId },
      data: {
        ...(newDate !== undefined && { date: newDate }),
        ...(clientNotes !== undefined && { clientNotes }),
        ...(durationMin !== undefined && { durationMin }),
      },
    });

    // Keep AssignedWorkout.scheduledDate in sync
    if (newDate && existing.assignedWorkoutId) {
      await tx.assignedWorkout.update({
        where: { id: existing.assignedWorkoutId },
        data: { scheduledDate: newDate },
      });
    }
  });

  return NextResponse.json({ ok: true });
});
