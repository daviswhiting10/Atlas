import { prisma } from "./client";
import { ROSTER } from "./roster";

export async function getClients(workspaceId: string) {
  return prisma.clientProfile.findMany({
    where: { workspaceId, deletedAt: null, ...ROSTER },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { sessionNotes: true, programAssignments: true, workoutLogs: true } },
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
        // Newest first, so the latest draft (say, a sheet just uploaded) is the one shown.
        orderBy: { createdAt: "desc" },
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
    lastContactAt?: Date;
  },
  /** A transaction, when the caller writes more than the client (the CSV import). */
  db: Pick<typeof prisma, "clientProfile"> = prisma
) {
  // The workspace comes from the caller's session, never from the request.
  return db.clientProfile.create({ data: { ...data, workspaceId } });
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
    reachOutDate: Date | null;
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
