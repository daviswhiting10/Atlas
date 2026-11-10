/**
 * Guest accounts — a one-tap way into the app with no email round-trip.
 *
 * Each guest gets their own workspace, so self-serve athletes are fully
 * isolated from a coach's client list and from each other.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { GOALS, normalizePrefs, type Prefs } from "@/lib/plan/generator";
import { createPlanForClient, ensureCatalog, seedDemoHistory } from "@/lib/plan/persist";

export const GUEST_EMAIL_DOMAIN = "guest.atlas.app";
/** Ceiling across all visitors — a backstop against runaway cost, not the main defence. */
const MAX_GUESTS_PER_HOUR = 120;
/** Per-visitor limit. Generous for a person, useless for a script. */
const MAX_GUESTS_PER_IP_PER_HOUR = 6;
const HOUR_MS = 3_600_000;

// Per-instance memory: good enough to stop one client from burning the shared
// ceiling for everyone. A platform-level rate limit (Vercel Firewall) is the
// right long-term home for this.
const recentByIp = new Map<string, number[]>();

function underIpLimit(ip: string | null): boolean {
  if (!ip) return true;
  const now = Date.now();
  const hits = (recentByIp.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
  if (hits.length >= MAX_GUESTS_PER_IP_PER_HOUR) return false;
  hits.push(now);
  recentByIp.set(ip, hits);
  if (recentByIp.size > 5000) recentByIp.clear();
  return true;
}

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
  /** Caller's IP, when known, for the per-visitor limit. */
  ip?: string | null;
}): Promise<{ id: string; name: string; email: string; role: "CLIENT"; workspaceId: string }> {
  if (!underIpLimit(input.ip ?? null)) throw new Error("Too many new accounts from this connection. Try again later.");

  const recent = await prisma.user.count({
    where: {
      email: { endsWith: `@${GUEST_EMAIL_DOMAIN}` },
      createdAt: { gte: new Date(Date.now() - HOUR_MS) },
    },
  });
  if (recent >= MAX_GUESTS_PER_HOUR) throw new Error("Too many new accounts right now. Try again shortly.");

  const demo = input.demo === true;
  const prefs = demo ? DEMO_PREFS : normalizePrefs(input.prefs);
  const name = (typeof input.name === "string" ? input.name : "").trim().slice(0, 40) || (demo ? "Alex" : "Athlete");
  const email = `${randomUUID()}@${GUEST_EMAIL_DOMAIN}`;
  const meta: AthleteMeta = { prefs, demo };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  if (demo) startDate.setDate(today.getDate() - DEMO_WEEKS_OF_HISTORY * 7);

  await ensureCatalog(); // shared library rows; resolved before the transaction opens

  // All or nothing: a failure part-way never leaves a half-built account behind.
  return prisma.$transaction(
    async (tx) => {
      const workspace = await tx.workspace.create({ data: { name: `${name} — personal` }, select: { id: true } });
      const user = await tx.user.create({
        data: { name, email, role: "CLIENT", workspaceId: workspace.id, emailVerified: new Date() },
        select: { id: true },
      });
      const profile = await tx.clientProfile.create({
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
      const { workouts } = await createPlanForClient({ workspaceId: workspace.id, clientId: profile.id, prefs, startDate }, tx);
      if (demo) await seedDemoHistory({ clientId: profile.id, prefs, workouts, until: today }, tx);
      return { id: user.id, name, email, role: "CLIENT" as const, workspaceId: workspace.id };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}
