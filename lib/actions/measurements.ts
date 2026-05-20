"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { checkBodyMilestones } from "@/lib/progress/milestones";
import { z } from "zod";

const MeasurementSchema = z.object({
  clientId: z.string(),
  measuredAt: z.string(), // ISO date string
  source: z.enum(["manual", "inbody", "other"]),
  bodyWeightKg: z.number().positive().nullable().optional(),
  bodyFatPct: z.number().min(0).max(100).nullable().optional(),
  leanMassKg: z.number().positive().nullable().optional(),
  visceralFat: z.number().nullable().optional(),
  waistCm: z.number().positive().nullable().optional(),
  hipsCm: z.number().positive().nullable().optional(),
  chestCm: z.number().positive().nullable().optional(),
  armCm: z.number().positive().nullable().optional(),
  thighCm: z.number().positive().nullable().optional(),
  painRating: z.number().int().min(0).max(10).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export async function saveMeasurement(
  input: z.infer<typeof MeasurementSchema>
): Promise<{ id: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  const workspaceId = session?.user?.workspaceId;
  if (!userId || !workspaceId) throw new Error("Unauthorized");

  const data = MeasurementSchema.parse(input);

  // Verify client belongs to workspace
  const client = await prisma.clientProfile.findFirst({
    where: { id: data.clientId, workspaceId, deletedAt: null },
    select: { id: true, primaryGoal: true },
  });
  if (!client) throw new Error("Client not found");

  const created = await prisma.measurement.create({
    data: {
      workspaceId,
      clientId: data.clientId,
      measuredAt: new Date(data.measuredAt),
      source: data.source,
      bodyWeightKg: data.bodyWeightKg ?? null,
      bodyFatPct: data.bodyFatPct ?? null,
      leanMassKg: data.leanMassKg ?? null,
      visceralFat: data.visceralFat ?? null,
      waistCm: data.waistCm ?? null,
      hipsCm: data.hipsCm ?? null,
      chestCm: data.chestCm ?? null,
      armCm: data.armCm ?? null,
      thighCm: data.thighCm ?? null,
      painRating: data.painRating ?? null,
      notes: data.notes ?? null,
      enteredByUserId: userId,
    },
    select: { id: true },
  });

  // Fire-and-forget body milestones
  if (data.bodyWeightKg != null) {
    checkBodyMilestones(workspaceId, data.clientId, data.bodyWeightKg, client.primaryGoal).catch(
      (err: unknown) => console.error("[milestones] body check:", err)
    );
  }

  return { id: created.id };
}
