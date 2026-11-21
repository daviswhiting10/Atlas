import { prisma } from "./client";
import { weekCount } from "@/lib/coach/week";
import { ROSTER } from "./roster";

export async function getClients(workspaceId: string) {
  const now = new Date();
  const clients = await prisma.clientProfile.findMany({
    where: { workspaceId, deletedAt: null, ...ROSTER },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { sessionNotes: true, programAssignments: true, workoutLogs: true } },
      // The latest finished session, for "Logged today" on the roster.
      workoutLogs: { where: { completedAt: { not: null } }, orderBy: { date: "desc" }, take: 1, select: { date: true } },
      // The live plan's workouts around now, for "3/4 this week" (the week is worked out per plan below).
      programAssignments: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          startDate: true,
          assignedWorkouts: {
            where: { scheduledDate: { gte: new Date(now.getTime() - 8 * 86_400_000), lte: new Date(now.getTime() + 8 * 86_400_000) } },
            select: { scheduledDate: true, status: true, workoutLog: { select: { completedAt: true } } },
          },
        },
      },
    },
  });
  // Plain objects out: the roster page reads `thisWeek`, not the plan's workouts.
  return clients.map(({ programAssignments, ...c }) => {
    const plan = programAssignments[0];
    const thisWeek = plan ? weekCount(plan.startDate, plan.assignedWorkouts.map((w) => ({ scheduledDate: w.scheduledDate, status: w.status, done: !!w.workoutLog?.completedAt })), now) : null;
    return { ...c, thisWeek };
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
              name: true,
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
