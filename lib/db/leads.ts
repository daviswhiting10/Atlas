import { prisma } from "./client";

export async function getLeads(workspaceId: string) {
  return prisma.lead.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLead(id: string, workspaceId: string) {
  return prisma.lead.findFirst({
    where: { id, workspaceId, deletedAt: null },
    include: { outreachLog: { orderBy: { createdAt: "desc" } } },
  });
}

export async function createLead(
  workspaceId: string,
  data: {
    fullName: string;
    email?: string;
    phone?: string;
    source: string;
    context?: string;
  }
) {
  return prisma.lead.create({ data: { workspaceId, ...data } });
}

export async function updateLead(
  id: string,
  workspaceId: string,
  data: Partial<{
    fullName: string;
    email: string;
    phone: string;
    source: string;
    context: string;
    status: "NEW" | "CONTACTED" | "REPLIED" | "BOOKED" | "CONVERTED" | "DEAD";
  }>
) {
  return prisma.lead.updateMany({
    where: { id, workspaceId, deletedAt: null },
    data,
  });
}
