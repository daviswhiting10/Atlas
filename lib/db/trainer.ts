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
    voiceProfile?: unknown;
  }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = data as any;
  return prisma.trainerProfile.upsert({
    where: { userId },
    update: payload,
    create: { userId, ...payload },
    include: { user: { select: { name: true, email: true } } },
  });
}
