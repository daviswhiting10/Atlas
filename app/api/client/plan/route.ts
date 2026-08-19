import { NextResponse } from "next/server";
import { withClient } from "@/lib/api/client-middleware";
import { prisma } from "@/lib/db/client";

export const GET = withClient(async (_req, { clientProfileId }) => {
  const assignment = await prisma.programAssignment.findFirst({
    where: { clientId: clientProfileId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      status: true,
      sourceProgram: { select: { name: true } },
      assignedWorkouts: {
        orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
        select: {
          id: true,
          name: true,
          scheduledDate: true,
          status: true,
          exercises: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              prescribedSets: true,
              exercise: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(assignment ?? null);
});
