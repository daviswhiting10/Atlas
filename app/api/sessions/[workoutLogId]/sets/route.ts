import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

type Ctx = { workoutLogId: string };

const SetUpdateSchema = z.object({
  sets: z.array(
    z.object({
      id: z.string(),
      weight: z.number().nullable(),
      reps: z.number().int().nonnegative().nullable(),
      rpe: z.number().min(1).max(10).nullable(),
      completed: z.boolean(),
    })
  ),
});

// PATCH /api/sessions/[workoutLogId]/sets
// Bulk-updates weight, reps, RPE, and completed on logged sets.
// Each set is scoped to the session so a client can't touch another workout's sets.
export const PATCH = withWorkspace<Ctx>(async (req, { workspaceId }, { params }) => {
  const { workoutLogId } = await params;

  const log = await prisma.workoutLog.findFirst({
    where: { id: workoutLogId, client: { workspaceId } },
    select: { id: true },
  });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = SetUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.sets.map((s) =>
      prisma.setLog.updateMany({
        where: { id: s.id, workoutLogId },
        data: {
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe,
          completed: s.completed,
        },
      })
    )
  );

  return NextResponse.json({ ok: true });
});
