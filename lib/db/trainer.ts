import { prisma } from "./client";

export async function getTrainer(workspaceId: string) {
  return prisma.trainerProfile.findFirst({
    where: { user: { workspaceId, role: "TRAINER" } },
    include: { user: { select: { name: true, email: true } } },
  });
}

export async function updateTrainer(
  userId: string,
  data: {
    bio?: string;
    certifications?: string[];
    voiceProfile?: Record<string, unknown> | string;
  }
) {
  return prisma.trainerProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
    include: { user: { select: { name: true, email: true } } },
  });
}
