/**
 * Guest accounts — a one-tap way into the app with no email round-trip.
 *
 * Each guest gets their own workspace, so self-serve athletes are fully
 * isolated from a coach's client list and from each other.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { GOALS, normalizePrefs, resolvePrefs, type Prefs } from "@/lib/plan/generator";
import { POLICIES, record, throttleKey, waitFor } from "@/lib/auth/throttle";
import { cleanupExpiredGuests } from "@/lib/guest-cleanup";
import { DEMO_CAPS, DemoBusyError, demoBusy } from "@/lib/guest-rules";

export { DEMO_CAPS, DemoBusyError, demoBusy };
import { createPlanForClient, ensureCatalog, seedDemoHistory } from "@/lib/plan/persist";
import { sealNow } from "@/lib/goals/data";

import { GUEST_EMAIL_DOMAIN } from "@/lib/auth/route-policy";
export { GUEST_EMAIL_DOMAIN };
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

/** Refuses (and counts nothing) when the demo is at its cap; otherwise counts this visit against the connection. */
export async function assertDemoCapacity(ip: string | null, perHour = DEMO_CAPS.perHour, now = new Date()): Promise<void> {
  const ipKey = ip ? throttleKey("demoIp", ip) : null;
  const [recent, ipWait] = await Promise.all([
    prisma.user.count({ where: { role: "TRAINER", email: { endsWith: `@${GUEST_EMAIL_DOMAIN}` }, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } } }),
    ipKey ? waitFor(ipKey, now) : Promise.resolve(0),
  ]);
  if (demoBusy(recent, ipWait, perHour)) throw new DemoBusyError();
  if (ipKey) await record(ipKey, POLICIES.demoIp, now);
}

export const DEMO_PREFS: Prefs = {
  goal: "muscle",
  experience: "intermediate",
  daysPerWeek: 4,
  equipment: "gym",
  minutes: 60,
};

export type AthleteMeta = { prefs: Prefs; demo: boolean };

type NewAthlete = { id: string; name: string; email: string; role: "CLIENT"; workspaceId: string };
type NewDemo = { id: string; name: string; email: string; role: "TRAINER"; workspaceId: string };

export async function createGuest(input: {
  name?: string;
  prefs?: unknown;
  demo?: boolean;
  /** Caller's IP, when known, for the per-visitor limit. */
  ip?: string | null;
}): Promise<NewAthlete | NewDemo> {
  if (input.demo === true) {
    await assertDemoCapacity(input.ip ?? null);
  } else {
    if (!underIpLimit(input.ip ?? null)) throw new Error("Too many new accounts from this connection. Try again later.");
    const recent = await prisma.user.count({
      where: {
        email: { endsWith: `@${GUEST_EMAIL_DOMAIN}` },
        createdAt: { gte: new Date(Date.now() - HOUR_MS) },
      },
    });
    if (recent >= MAX_GUESTS_PER_HOUR) throw new Error("Too many new accounts right now. Try again shortly.");
  }

  const email = `${randomUUID()}@${GUEST_EMAIL_DOMAIN}`;
  const guest = input.demo === true ? await createDemo(email) : await createAthlete({ ...input, email, passwordHash: null });
  // Old demo and guest workspaces are removed a couple at a time, as new ones arrive (no job to schedule).
  await cleanupExpiredGuests();
  return guest;
}

/**
 * A self-serve athlete: their own workspace (isolated from every coach's
 * client list and from other athletes), their profile, and a plan built from
 * their answers. A guest gets a placeholder email and no password; a real
 * account gets both. Rate limits are the caller's job.
 */
export async function createAthlete(input: {
  name?: string;
  prefs?: unknown;
  email: string;
  passwordHash: string | null;
}): Promise<NewAthlete> {
  const prefs = normalizePrefs(input.prefs);
  const name = (typeof input.name === "string" ? input.name : "").trim().slice(0, 40) || "Athlete";
  const email = input.email;
  const meta: AthleteMeta = { prefs, demo: false };

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  await ensureCatalog(); // shared library rows; resolved before the transaction opens

  // All or nothing: a failure part-way never leaves a half-built account behind.
  return prisma.$transaction(
    async (tx) => {
      const workspace = await tx.workspace.create({ data: { name: `${name} — personal` }, select: { id: true } });
      const user = await tx.user.create({
        data: { name, email, passwordHash: input.passwordHash, role: "CLIENT", workspaceId: workspace.id, emailVerified: input.passwordHash ? null : new Date() },
        select: { id: true },
      });
      const profile = await tx.clientProfile.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          fullName: name,
          primaryGoal: GOALS[resolvePrefs(prefs).goal].primaryGoal,
          status: "ACTIVE",
          goalTargets: { athlete: meta },
        },
        select: { id: true },
      });
      await createPlanForClient({ workspaceId: workspace.id, clientId: profile.id, prefs, startDate }, tx);
      return { id: user.id, name, email, role: "CLIENT" as const, workspaceId: workspace.id };
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}

/**
 * Someone signing in with Google for the first time, with no Atlas account
 * yet: a self-serve athlete in their own workspace, like an email sign-up.
 * No plan yet; they build one from Today (or it's built from the plan
 * wizard answers they gave before signing in).
 */
export async function createOAuthAthlete(input: { email: string; name?: string | null; image?: string | null; emailVerified?: Date | null }) {
  const email = input.email.trim().toLowerCase();
  const name = (input.name ?? "").trim().slice(0, 40) || email.split("@")[0].slice(0, 40) || "Athlete";
  const meta: AthleteMeta = { prefs: normalizePrefs(undefined), demo: false };
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({ data: { name: `${name} — personal` }, select: { id: true } });
    const user = await tx.user.create({
      data: { email, name, image: input.image ?? null, emailVerified: input.emailVerified ?? new Date(), role: "CLIENT", workspaceId: workspace.id },
    });
    await tx.clientProfile.create({
      data: { workspaceId: workspace.id, userId: user.id, fullName: name, email, status: "ACTIVE", goalTargets: { athlete: meta } },
    });
    return user;
  });
}

// ── The demo ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const daysAgo = (today: Date, n: number) => {
  const d = new Date(today);
  d.setDate(today.getDate() - n);
  return d;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The demo coach's clients: where each is in their plan, and what they train for. No emails, no logins. */
const DEMO_ROSTER: Array<{ name: string; prefs: Prefs; weeksIn: number | null; seed: number; skip: number[] }> = [
  { name: "Jordan Lee", prefs: { goal: "muscle", experience: "intermediate", daysPerWeek: 4, equipment: "gym", minutes: 60 }, weeksIn: 7, seed: 11, skip: [5, 17] },
  { name: "Sam Patel", prefs: { goal: "strength", experience: "advanced", daysPerWeek: 3, equipment: "gym", minutes: 75 }, weeksIn: 10, seed: 23, skip: [12] },
  { name: "Maya Chen", prefs: { goal: "general", experience: "beginner", daysPerWeek: 3, equipment: "gym", minutes: 45 }, weeksIn: 3, seed: 37, skip: [] },
  { name: "Chris Okafor", prefs: { goal: "fat_loss", experience: "intermediate", daysPerWeek: 4, equipment: "gym", minutes: 45 }, weeksIn: 5, seed: 41, skip: [3, 15, 16, 17] },
  { name: "Riley Morgan", prefs: { goal: "muscle", experience: "beginner", daysPerWeek: 3, equipment: "gym", minutes: 60 }, weeksIn: null, seed: 0, skip: [] },
];

/**
 * The demo: a coach ("Alex") in a workspace of their own, isolated like every
 * guest. Their own training (My training) has about five months behind it —
 * a finished strength block, then the current muscle plan in its last week —
 * and a finished 30-day goal with its chapter. Their roster is five clients at
 * different points (one brand new), with sessions the coach hasn't seen yet.
 * Nobody here has an email or a login, so nothing can reach a real person.
 */
async function createDemo(email: string): Promise<NewDemo> {
  const name = "Alex";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await ensureCatalog();

  const made = await prisma.$transaction(
    async (tx) => {
      const workspace = await tx.workspace.create({ data: { name: `${name} — demo` }, select: { id: true } });
      const workspaceId = workspace.id;
      const user = await tx.user.create({ data: { name, email, passwordHash: null, role: "TRAINER", workspaceId, emailVerified: new Date() }, select: { id: true } });

      // My training: a strength block that finished, then the plan running now (week 12 of 12).
      const strength: Prefs = { ...DEMO_PREFS, goal: "strength" };
      const me = await tx.clientProfile.create({
        data: { workspaceId, userId: user.id, fullName: name, primaryGoal: GOALS[resolvePrefs(DEMO_PREFS).goal].primaryGoal, status: "ACTIVE", goalTargets: { athlete: { prefs: DEMO_PREFS, demo: true } satisfies AthleteMeta } },
        select: { id: true },
      });
      const before = await createPlanForClient({ workspaceId, clientId: me.id, prefs: strength, startDate: daysAgo(today, 23 * 7) }, tx);
      const now = await createPlanForClient({ workspaceId, clientId: me.id, prefs: DEMO_PREFS, startDate: daysAgo(today, 11 * 7) }, tx);
      // One history across both plans, so each lift keeps climbing from where the last block left it.
      await seedDemoHistory({ clientId: me.id, prefs: DEMO_PREFS, workouts: [...before.workouts, ...now.workouts], until: today, skip: new Set([9, 30, 41]) }, tx);

      // A 30-day habits goal, finished two months ago: its chapter is on the You screen.
      const startDay = daysAgo(today, 95);
      const rules = [
        { key: "steps", label: "10,000 steps", kind: "check_in" as const, per: "day" as const, value: "done" as const },
        { key: "protein", label: "Protein at every meal", kind: "check_in" as const, per: "day" as const, value: "done" as const },
        { key: "mobility", label: "10 minutes of mobility", kind: "check_in" as const, per: "day" as const, value: "done" as const },
      ];
      const goal = await tx.goal.create({
        data: {
          workspaceId,
          clientId: me.id,
          templateKey: null,
          name: "30-day reset",
          category: "consistency",
          rules: { length: { days: 30 }, rules, onMiss: "reset" },
          timeZone: "UTC",
          startDay: ymd(startDay),
          status: "COMPLETED",
          startedBy: "TRAINER",
          endedAt: new Date(startDay.getTime() + 29 * DAY_MS + 20 * 3_600_000), // the evening of day 30
          createdAt: startDay,
        },
        select: { id: true },
      });
      await tx.goalCheckIn.createMany({
        data: Array.from({ length: 30 }, (_, i) => ymd(new Date(startDay.getTime() + i * DAY_MS))).flatMap((day) =>
          rules.map((r) => ({ goalId: goal.id, ruleKey: r.key, day, by: "TRAINER" as const }))
        ),
      });

      // The roster. Sessions from the last four days are new to the coach.
      const unseenAfter = daysAgo(today, 4);
      for (const c of DEMO_ROSTER) {
        const p = await tx.clientProfile.create({
          data: { workspaceId, fullName: c.name, primaryGoal: GOALS[resolvePrefs(c.prefs).goal].primaryGoal, status: "ACTIVE", createdAt: daysAgo(today, (c.weeksIn ?? 0) * 7 + 3) },
          select: { id: true },
        });
        if (c.weeksIn == null) continue; // new: no plan yet
        const plan = await createPlanForClient({ workspaceId, clientId: p.id, prefs: c.prefs, startDate: daysAgo(today, c.weeksIn * 7 - 1) }, tx);
        await seedDemoHistory({ clientId: p.id, prefs: c.prefs, workouts: plan.workouts, until: today, seed: c.seed, skip: new Set(c.skip), unseenAfter }, tx);
      }
      return { id: user.id, workspaceId, goalId: goal.id, clientId: me.id };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
  // The chapter is written the way the app writes any finished goal's.
  await sealNow(made.goalId, made.clientId);
  return { id: made.id, name, email, role: "TRAINER", workspaceId: made.workspaceId };
}
