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
          programAssignment: { select: { id: true, name: true, startDate: true } },
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
  // null = detach from any program slot; string = link to this AssignedWorkout ID
  assignedWorkoutId: z.string().nullable().optional(),
});

// PATCH /api/sessions/[workoutLogId]
// Updates WorkoutLog fields and optionally re-assigns it to a program slot.
export const PATCH = withWorkspace<Ctx>(async (req, { workspaceId }, { params }) => {
  const { workoutLogId } = await params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.workoutLog.findFirst({
    where: { id: workoutLogId, client: { workspaceId } },
    select: { id: true, assignedWorkoutId: true, clientId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { date, clientNotes, durationMin, assignedWorkoutId } = parsed.data;
  const newDate = date ? new Date(date) : undefined;

  try {
    await prisma.$transaction(async (tx) => {
      // ── Re-assignment logic ─────────────────────────────────────────────────
      if (assignedWorkoutId !== undefined) {
        const newSlotId = assignedWorkoutId; // may be null (detach)

        if (newSlotId !== null) {
          // Verify new slot belongs to this workspace + client
          const slot = await tx.assignedWorkout.findFirst({
            where: { id: newSlotId, workspaceId },
            include: {
              workoutLog: { select: { id: true } },
              programAssignment: { select: { clientId: true } },
            },
          });
          if (!slot) throw new Error("Workout slot not found");
          if (slot.programAssignment.clientId !== existing.clientId) {
            throw new Error("Slot belongs to a different client");
          }
          // If target already has a *different* log, refuse
          if (slot.workoutLog && slot.workoutLog.id !== workoutLogId) {
            throw new Error("That slot already has a logged session");
          }
          // Mark new slot as LOGGED
          await tx.assignedWorkout.update({
            where: { id: newSlotId },
            data: { status: "LOGGED" },
          });
        }

        // Revert old slot back to PLANNED if we're changing / detaching
        const oldSlotId = existing.assignedWorkoutId;
        if (oldSlotId && oldSlotId !== newSlotId) {
          await tx.assignedWorkout.update({
            where: { id: oldSlotId },
            data: { status: "PLANNED" },
          });
        }
      }

      // ── Update the WorkoutLog ───────────────────────────────────────────────
      await tx.workoutLog.update({
        where: { id: workoutLogId },
        data: {
          ...(newDate !== undefined && { date: newDate }),
          ...(clientNotes !== undefined && { clientNotes }),
          ...(durationMin !== undefined && { durationMin }),
          ...(assignedWorkoutId !== undefined && { assignedWorkoutId }),
        },
      });

      // Keep AssignedWorkout.scheduledDate in sync when date changes
      const effectiveSlotId =
        assignedWorkoutId !== undefined ? assignedWorkoutId : existing.assignedWorkoutId;
      if (newDate && effectiveSlotId) {
        await tx.assignedWorkout.update({
          where: { id: effectiveSlotId },
          data: { scheduledDate: newDate },
        });
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
});

// DELETE /api/sessions/[workoutLogId]
// Deletes a WorkoutLog and all its associated sets
export const DELETE = withWorkspace<Ctx>(async (_req, { workspaceId }, { params }) => {
  const { workoutLogId } = await params;

  const existing = await prisma.workoutLog.findFirst({
    where: { id: workoutLogId, client: { workspaceId } },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete sets first (no cascade configured), then the log
  await prisma.$transaction([
    prisma.setLog.deleteMany({ where: { workoutLogId } }),
    prisma.workoutLog.delete({ where: { id: workoutLogId } }),
  ]);

  return NextResponse.json({ ok: true });
});
