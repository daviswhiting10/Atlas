import { prisma } from "./client";

export async function getClients(workspaceId: string) {
  return prisma.clientProfile.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { sessionNotes: true, programAssignments: true } },
    },
  });
}

export async function getClient(id: string, workspaceId: string) {
  return prisma.clientProfile.findFirst({
    where: { id, workspaceId, deletedAt: null },
    include: {
      intakeForms: { orderBy: { createdAt: "desc" } },
      assessments: { orderBy: { createdAt: "desc" } },
      programAssignments: {
        orderBy: { startDate: "desc" },
        include: {
          sourceProgram: { select: { id: true, name: true } },
          _count: { select: { assignedWorkouts: true } },
        },
      },
      sessionNotes: { orderBy: { date: "desc" }, take: 20 },
      workoutLogs: {
        orderBy: { date: "desc" },
        take: 50,
        include: {
          assignedWorkout: {
            select: {
              scheduledDate: true,
              programAssignment: { select: { name: true } },
            },
          },
          _count: { select: { sets: true } },
        },
      },
      outreachLog: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}

export async function createClient(
  workspaceId: string,
  data: {
    fullName: string;
    email?: string;
    phone?: string;
    primaryGoal?: string;
    status?: "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";
  }
) {
  return prisma.clientProfile.create({ data: { workspaceId, ...data } });
}

export async function updateClient(
  id: string,
  workspaceId: string,
  data: Partial<{
    fullName: string;
    email: string;
    phone: string;
    primaryGoal: string;
    status: "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";
    retentionScore: number;
    retentionFlag: string;
    lastContactAt: Date;
  }>
) {
  // updateMany to enforce workspaceId scoping on the write path too
  return prisma.clientProfile.updateMany({
    where: { id, workspaceId, deletedAt: null },
    data,
  });
}

export async function deleteClient(id: string, workspaceId: string) {
  return prisma.clientProfile.updateMany({
    where: { id, workspaceId },
    data: { deletedAt: new Date() },
  });
}

const AT_RISK_DAYS = 21;

/**
 * Heuristic run on inbox load: any ACTIVE client with no contact in AT_RISK_DAYS
 * gets flipped to AT_RISK. Fire-and-forget safe to call on every page load.
 */
export async function runRetentionHeuristic(workspaceId: string): Promise<void> {
  const cutoff = new Date(Date.now() - AT_RISK_DAYS * 24 * 60 * 60 * 1000);

  await prisma.clientProfile.updateMany({
    where: {
      workspaceId,
      deletedAt: null,
      status: "ACTIVE",
      OR: [
        { lastContactAt: { lt: cutoff } },
        { lastContactAt: null, createdAt: { lt: cutoff } },
      ],
    },
    data: {
      status: "AT_RISK",
      retentionFlag: `No contact in ${AT_RISK_DAYS}+ days`,
    },
  });
}
