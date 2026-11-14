"use server";

/**
 * Goals, from the athlete's side (a client, or a coach in My training).
 * Every write derives the person from the session and re-checks that the goal
 * is theirs. A goal only ever writes its own rows, with one exception: the
 * "how long was it?" answer fills in a session's missing duration.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import { athleteIdentity } from "@/lib/athlete/identity";
import { TZ_COOKIE } from "@/lib/athlete/data";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { prisma } from "@/lib/db/client";
import { addDays } from "@/lib/goals/days";
import { sealNow } from "@/lib/goals/data";
import { previewStart } from "@/lib/goals/preview";
import { DAY, GoalRules, addCheckInRule, removeRule, ruleActiveOn } from "@/lib/goals/rules";
import { templateByKey } from "@/lib/goals/templates";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const Id = z.string().min(1).max(64);
const Day = z.string().regex(DAY);
const Key = z.string().min(1).max(40);

async function me() {
  const session = await auth();
  const identity = await athleteIdentity(session?.user);
  if (!identity) throw new Error("Unauthorized");
  return { clientId: identity.clientId, workspaceId: identity.workspaceId, by: identity.isCoach ? ("TRAINER" as const) : ("CLIENT" as const) };
}

async function ownActiveGoal(goalId: string, clientId: string) {
  const g = await prisma.goal.findFirst({ where: { id: Id.parse(goalId), clientId, status: "ACTIVE" } });
  if (!g) throw new Error("That goal isn't running.");
  return { goal: g, rules: GoalRules.parse(g.rules), today: localDay(new Date(), g.timeZone) };
}

/** Can a tick or tag still be changed on this day? Real days only, until the day after it closes. */
function editable(day: string, today: string, startDay: string, carriedThrough?: string): string | null {
  if (day < startDay || day > today) return "That day is outside the goal.";
  if (carriedThrough && day <= carriedThrough) return "That day is from before Atlas.";
  if (today >= addDays(day, 2)) return "That day has closed.";
  return null;
}

const refresh = (goalId?: string) => {
  revalidatePath("/today");
  revalidatePath("/progress");
  if (goalId) revalidatePath(`/goals/${goalId}`);
};

const StartInput = z.object({
  templateKey: z.string().max(40),
  startDay: Day,
  /** Template rules switched off before starting. */
  drop: z.array(Key).max(20).default([]),
  /** Extra daily ticks, by label. */
  add: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
});

export async function startGoal(raw: unknown): Promise<Result<{ goalId: string }>> {
  const { clientId, workspaceId, by } = await me();
  const parsed = StartInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Something in that doesn't look right." };
  const input = parsed.data;
  const template = templateByKey(input.templateKey);
  if (!template) return { ok: false, error: "Unknown goal." };

  const timeZone = safeTimeZone(cookies().get(TZ_COOKIE)?.value);
  const today = localDay(new Date(), timeZone);
  const preview = previewStart(input.startDay, today, template.rules.length.days);
  if (!preview.ok) return preview;

  if (await prisma.goal.findFirst({ where: { clientId, status: "ACTIVE" }, select: { id: true } })) return { ok: false, error: "You already have a goal running." };

  let rules: GoalRules;
  try {
    // Rules switched off at the start never judged a day, so they're simply left out.
    const kept = { ...template.rules, rules: template.rules.rules.filter((r) => !input.drop.includes(r.key)) };
    rules = input.add.reduce((r, label) => addCheckInRule(r, label, input.startDay), GoalRules.parse(kept));
    // Added at the start means judged from day 1, not from "today".
    rules = GoalRules.parse({ ...rules, rules: rules.rules.map((r) => (r.fromDay === input.startDay ? { ...r, fromDay: undefined } : r)), ...(preview.carriedDays > 0 ? { carriedThrough: addDays(today, -1) } : {}) });
  } catch {
    return { ok: false, error: "A goal needs at least one rule." };
  }

  const goal = await prisma.goal.create({
    data: { workspaceId, clientId, templateKey: template.key, name: template.name, category: template.category, rules, timeZone, startDay: input.startDay, startedBy: by },
    select: { id: true },
  });
  refresh();
  return { ok: true, goalId: goal.id };
}

const TickInput = z.object({ goalId: Id, ruleKey: Key, day: Day, on: z.boolean() });

/** Tick (or untick) a daily rule. */
export async function tickRule(raw: unknown): Promise<Result> {
  const { clientId, by } = await me();
  const input = TickInput.parse(raw);
  const { goal, rules, today } = await ownActiveGoal(input.goalId, clientId);
  const rule = rules.rules.find((r) => r.key === input.ruleKey);
  if (!rule || rule.kind !== "check_in" || !ruleActiveOn(rule, input.day)) return { ok: false, error: "That isn't something to tick." };
  const blocked = editable(input.day, today, goal.startDay, rules.carriedThrough);
  if (blocked) return { ok: false, error: blocked };

  if (input.on) {
    try {
      await prisma.goalCheckIn.create({ data: { goalId: goal.id, ruleKey: rule.key, day: input.day, by } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // already ticked
    }
  } else {
    await prisma.goalCheckIn.deleteMany({ where: { goalId: goal.id, ruleKey: rule.key, day: input.day, workoutLogId: null, excuse: false } });
  }
  refresh(goal.id);
  return { ok: true };
}

const TagInput = z.object({ goalId: Id, sessionId: Id, mark: Key, on: z.boolean() });

/** Tag (or untag) a finished session, for example "outdoors". The session itself isn't touched. */
export async function tagSession(raw: unknown): Promise<Result> {
  const { clientId, by } = await me();
  const input = TagInput.parse(raw);
  const { goal, rules, today } = await ownActiveGoal(input.goalId, clientId);
  const usesMark = rules.rules.some((r) => r.kind === "sessions" && r.where.mark === input.mark);
  if (!usesMark) return { ok: false, error: "This goal doesn't use that tag." };
  const session = await prisma.workoutLog.findFirst({ where: { id: input.sessionId, clientId, completedAt: { not: null } }, select: { id: true, date: true } });
  if (!session) return { ok: false, error: "That workout isn't there." };
  const day = localDay(session.date, goal.timeZone);
  const blocked = editable(day, today, goal.startDay, rules.carriedThrough);
  if (blocked) return { ok: false, error: blocked };

  if (input.on) {
    try {
      await prisma.goalCheckIn.create({ data: { goalId: goal.id, ruleKey: input.mark, day, workoutLogId: session.id, by } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  } else {
    await prisma.goalCheckIn.deleteMany({ where: { goalId: goal.id, ruleKey: input.mark, workoutLogId: session.id } });
  }
  refresh(goal.id);
  return { ok: true };
}

const DurationInput = z.object({ goalId: Id.optional(), sessionId: Id, minutes: z.number().int().min(1).max(600) });

/** "How long was it?": fills in a finished session's missing duration. Never overwrites one that's there. */
export async function setSessionDuration(raw: unknown): Promise<Result> {
  const { clientId } = await me();
  const input = DurationInput.parse(raw);
  const done = await prisma.workoutLog.updateMany({ where: { id: input.sessionId, clientId, completedAt: { not: null }, durationMin: null }, data: { durationMin: input.minutes } });
  if (done.count === 0) return { ok: false, error: "That workout already has a time, or isn't there." };
  refresh(input.goalId);
  return { ok: true };
}

/** A new daily tick, counted from today. */
export async function addGoalRule(raw: unknown): Promise<Result> {
  const { clientId } = await me();
  const input = z.object({ goalId: Id, label: z.string().trim().min(1).max(60) }).parse(raw);
  const { goal, rules, today } = await ownActiveGoal(input.goalId, clientId);
  const next = addCheckInRule(rules, input.label, today);
  await prisma.goal.update({ where: { id: goal.id }, data: { rules: next } });
  refresh(goal.id);
  return { ok: true };
}

/** Stop counting a rule from tomorrow. The days it already judged keep their result. */
export async function removeGoalRule(raw: unknown): Promise<Result> {
  const { clientId } = await me();
  const input = z.object({ goalId: Id, key: Key }).parse(raw);
  const { goal, rules, today } = await ownActiveGoal(input.goalId, clientId);
  try {
    await prisma.goal.update({ where: { id: goal.id }, data: { rules: removeRule(rules, input.key, today) } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove that." };
  }
  refresh(goal.id);
  return { ok: true };
}

/** Stop the goal now. Its chapter starts as a draft. */
export async function endGoal(raw: unknown): Promise<Result> {
  const { clientId } = await me();
  const { goalId } = z.object({ goalId: Id }).parse(raw);
  const done = await prisma.goal.updateMany({ where: { id: goalId, clientId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });
  if (done.count === 0) return { ok: false, error: "That goal isn't running." };
  refresh(goalId);
  return { ok: true };
}

/** Seal the chapter now instead of waiting 48 hours. */
export async function sealChapterNow(raw: unknown): Promise<Result> {
  const { clientId } = await me();
  const { goalId } = z.object({ goalId: Id }).parse(raw);
  const ok = await sealNow(goalId, clientId);
  if (!ok) return { ok: false, error: "That chapter can't be sealed." };
  refresh(goalId);
  return { ok: true };
}
