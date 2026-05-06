import { prisma } from "./client";

export async function getLeads() {
  return prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getLead(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: { outreachLog: { orderBy: { createdAt: "desc" } } },
  });
}

export async function createLead(data: {
  fullName: string;
  email?: string;
  phone?: string;
  source: string;
  context?: string;
}) {
  return prisma.lead.create({ data });
}

export async function updateLead(
  id: string,
  data: Partial<{
    fullName: string;
    email: string;
    phone: string;
    source: string;
    context: string;
    status: string;
  }>
) {
  return prisma.lead.update({ where: { id }, data });
}
