import { prisma } from "./client";

const DEFAULT_TRAINER_ID = "singleton";

export async function getTrainer() {
  return prisma.trainer.findFirst();
}

export async function upsertTrainer(data: {
  name: string;
  email: string;
  voiceProfile?: string;
}) {
  const existing = await prisma.trainer.findFirst();
  if (existing) {
    return prisma.trainer.update({ where: { id: existing.id }, data });
  }
  return prisma.trainer.create({ data: { ...data, id: DEFAULT_TRAINER_ID } });
}
