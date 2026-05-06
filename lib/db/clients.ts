import { prisma } from "./client";
import { ClientStatus } from "@/app/generated/prisma/client";

export async function getClients() {
  return prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: { sessionNotes: true, programs: true },
      },
    },
  });
}

export async function getClient(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      intakeForms: { orderBy: { createdAt: "desc" } },
      assessments: { orderBy: { createdAt: "desc" } },
      programs: { orderBy: { createdAt: "desc" } },
      sessionNotes: { orderBy: { date: "desc" }, take: 20 },
      outreachLog: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}

export async function createClient(data: {
  fullName: string;
  email?: string;
  phone?: string;
  primaryGoal?: string;
  status?: ClientStatus;
}) {
  return prisma.client.create({ data });
}

export async function updateClient(
  id: string,
  data: Partial<{
    fullName: string;
    email: string;
    phone: string;
    primaryGoal: string;
    status: ClientStatus;
    retentionScore: number;
    retentionFlag: string;
    lastContactAt: Date;
  }>
) {
  return prisma.client.update({ where: { id }, data });
}

export async function deleteClient(id: string) {
  return prisma.client.delete({ where: { id } });
}
