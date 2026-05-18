import { NextResponse } from "next/server";
import { withClient } from "@/lib/api/client-middleware";
import { prisma } from "@/lib/db/client";

export const GET = withClient(async (_req, { clientProfileId }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const workout = await prisma.assignedWorkout.findFirst({
    where: {
      scheduledDate: { gte: today, lt: tomorrow },
      status: "PLANNED",
      programAssignment: {
        clientId: clientProfileId,
        status: "ACTIVE",
      },
    },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: { exercise: { select: { id: true, name: true, equipment: true } } },
      },
      programAssignment: { select: { name: true } },
    },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(workout ?? null);
});
