/**
 * Whose training the athlete app (Today, Plan, workouts, Progress, You) shows.
 *
 * A client sees their own profile. A coach sees "My training": a profile of
 * their own in their workspace, linked to their coach login and left out of
 * every client list (lib/db/roster.ts). It is created the first time they
 * open it, with no plan yet, so they build one the way any athlete does.
 */

import { prisma } from "@/lib/db/client";
import { normalizePrefs } from "@/lib/plan/generator";

export type AthleteIdentity = { clientId: string; workspaceId: string; isCoach: boolean };

type SessionUser = {
  id?: string;
  role?: string;
  name?: string | null;
  workspaceId?: string;
  clientProfileId?: string;
};

export async function athleteIdentity(user: SessionUser | undefined): Promise<AthleteIdentity | null> {
  if (!user?.id || !user.workspaceId) return null;

  if (user.role === "CLIENT") {
    if (!user.clientProfileId) return null;
    // A client the coach has deleted no longer gets into the app.
    const live = await prisma.clientProfile.findFirst({ where: { id: user.clientProfileId, workspaceId: user.workspaceId, deletedAt: null }, select: { id: true } });
    return live ? { clientId: live.id, workspaceId: user.workspaceId, isCoach: false } : null;
  }

  const own = await prisma.clientProfile.findFirst({
    where: { userId: user.id, workspaceId: user.workspaceId },
    select: { id: true },
  });
  if (own) return { clientId: own.id, workspaceId: user.workspaceId, isCoach: true };

  try {
    const created = await prisma.clientProfile.create({
      data: {
        workspaceId: user.workspaceId,
        userId: user.id,
        fullName: user.name?.trim() || "Me",
        status: "ACTIVE",
        // Marks this as a self-directed athlete: they build and rebuild their own plan.
        goalTargets: { athlete: { prefs: normalizePrefs(undefined), demo: false } },
      },
      select: { id: true },
    });
    return { clientId: created.id, workspaceId: user.workspaceId, isCoach: true };
  } catch {
    // Two tabs opening My training at once: the other one created it.
    const again = await prisma.clientProfile.findFirst({ where: { userId: user.id, workspaceId: user.workspaceId }, select: { id: true } });
    return again ? { clientId: again.id, workspaceId: user.workspaceId, isCoach: true } : null;
  }
}
