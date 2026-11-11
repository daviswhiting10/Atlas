import { prisma } from "./client";

/**
 * The coach's profile: the voice the AI writes in and the name it signs with.
 * Always the signed-in coach's own; a workspace can have more than one.
 */
export async function getTrainer(workspaceId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, workspaceId },
    select: { name: true, email: true, trainerProfile: { select: { voiceProfile: true } } },
  });
  if (!user) return null;
  const voice = user.trainerProfile?.voiceProfile;
  return {
    name: user.name?.trim() || null,
    voice: typeof voice === "string" ? voice.trim() || null : voice ? JSON.stringify(voice) : null,
  };
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
