import { prisma } from "@/lib/db/client";
import { dailyPoints, type BodyWeightPoint } from "./body-weight";

/** The athlete's body weight, one point a day, for the last two years (oldest first). */
export async function loadBodyWeights(clientId: string, workspaceId: string, timeZone: string): Promise<BodyWeightPoint[]> {
  const rows = await prisma.measurement.findMany({
    where: { clientId, workspaceId, bodyWeightKg: { not: null }, measuredAt: { gte: new Date(Date.now() - 730 * 86_400_000) } },
    orderBy: { measuredAt: "asc" },
    select: { measuredAt: true, bodyWeightKg: true },
    take: 1000,
  });
  return dailyPoints(rows, timeZone);
}
