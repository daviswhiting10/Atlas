/**
 * Guest accounts — a one-tap way into the app with no email round-trip.
 *
 * Each guest gets their own workspace, so self-serve athletes are fully
 * isolated from a coach's client list and from each other.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { GOALS, normalizePrefs, type Prefs } from "@/lib/plan/generator";
import { createPlanForClient, seedDemoHistory } from "@/lib/plan/persist";

export const GUEST_EMAIL_DOMAIN = "guest.atlas.app";
const MAX_GUESTS_PER_HOUR = 120;

export const DEMO_PREFS: Prefs = {
  goal: "muscle",
  experience: "intermediate",
  daysPerWeek: 4,
  equipment: "gym",
  minutes: 60,
};
const DEMO_WEEKS_OF_HISTORY = 9;

export type AthleteMeta = { prefs: Prefs; demo: boolean };

export async function createGuest(input: {
  name?: string;
  prefs?: unknown;
  demo?: boolean;
}): Promise<{ id: string; name: string; email: string; role: "CLIENT"; workspaceId: string }> {
  // Cheap abuse guard: guests are free to create, so cap the hourly rate.
  const recent = await prisma.user.count({
    where: {
      email: { endsWith: `@${GUEST_EMAIL_DOMAIN}` },
      createdAt: { gte: new Date(Date.now() - 3_600_000) },
    },
  });
  if (recent >= MAX_GUESTS_PER_HOUR) throw new Error("Too many new accounts right now. Try again shortly.");

  const demo = input.demo === true;
  const prefs = demo ? DEMO_PREFS : normalizePrefs(input.prefs);
  const name = (input.name ?? "").trim().slice(0, 40) || (demo ? "Alex" : "Athlete");
  const email = `${randomUUID()}@${GUEST_EMAIL_DOMAIN}`;

  const workspace = await prisma.workspace.create({
    data: { name: `${name} — personal` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { name, email, role: "CLIENT", workspaceId: workspace.id, emailVerified: new Date() },
    select: { id: true },
  });
  const meta: AthleteMeta = { prefs, demo };
  const profile = await prisma.clientProfile.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      fullName: name,
      primaryGoal: GOALS[prefs.goal].primaryGoal,
      status: "ACTIVE",
      goalTargets: { athlete: meta },
    },
    select: { id: true },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  if (demo) startDate.setDate(today.getDate() - DEMO_WEEKS_OF_HISTORY * 7);

  const { workouts } = await createPlanForClient({
    workspaceId: workspace.id,
    clientId: profile.id,
    prefs,
    startDate,
  });
  if (demo) await seedDemoHistory({ clientId: profile.id, prefs, workouts, until: today });

  return { id: user.id, name, email, role: "CLIENT", workspaceId: workspace.id };
}
