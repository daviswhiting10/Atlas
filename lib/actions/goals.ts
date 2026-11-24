"use server";

/**
 * Goals, from the athlete's side (a client, or a coach in My training).
 * Every write derives the person from the session and re-checks that the goal
 * is theirs. A goal writes its own rows, plus the one-tap "Workout, 45 min" sessions the
 * workout rows log (a finished session with a name and a time and no sets) and take back.
 *
 * 75 Hard is kept to its own rules (lib/goals/templates.ts): there is no action that adds, drops or loosens a
 * rule. The one thing a person writes is what their diet is (startGoal's `diet`, and setDiet).
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
import { checkSessionMilestones } from "@/lib/progress/milestones";
import { dayToDate } from "@/lib/sessions/day";
import { addDays } from "@/lib/goals/days";
import { loadGoal, sealNow } from "@/lib/goals/data";
import { confirmStart } from "@/lib/goals/preview";
import { WorkoutMinutes } from "@/lib/goals/rows";
import { DAY, GoalRules, ruleActiveOn } from "@/lib/goals/rules";
import { DEFAULT_DIET, DIET_KEY, templateByKey } from "@/lib/goals/templates";

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
  const rules = GoalRules.parse(g.rules);
  // A goal a miss fails may have failed since anyone last looked: judge it (that writes the failure) before taking a check-in.
  if (rules.missFails === true) {
    const loaded = await loadGoal(g.id, clientId);
    if (!loaded || loaded.goal.status !== "ACTIVE") throw new Error("That goal isn't running.");
  }
  return { goal: g, rules, today: localDay(new Date(), g.timeZone) };
}

/**
 * Can a tick or tag still be changed on this day? Real days only. A goal a miss fails takes today only (in its
 * own timezone); one started before that rule keeps the old window, until the day after the day closes.
 */
function editable(day: string, today: string, startDay: string, rules: GoalRules): string | null {
  if (day < startDay || day > today) return "That day is outside the goal.";
  if (rules.carriedThrough && day <= rules.carriedThrough) return "That day is from before Atlas.";
  if (rules.missFails === true) return day === today ? null : "Only today can be checked in.";
  if (today >= addDays(day, 2)) return "That day has closed.";
  return null;
}

const refresh = (goalId?: string) => {
  revalidatePath("/today");
  revalidatePath("/progress");
  if (goalId) revalidatePath(`/goals/${goalId}`);
};

/** What the diet rule says: one line. */
const Diet = z.string().transform((v) => v.replace(/\s+/g, " ").trim()).pipe(z.string().max(120));

const StartInput = z.object({
  templateKey: z.string().max(40),
  startDay: Day,
  /** The day number the form showed on its Start button; the server refuses if the start day gives another. */
  shownDay: z.number().int().min(1).max(366),
  /** What the diet is, in the person's words; blank or missing means the default. */
  diet: Diet.optional(),
});

export async function startGoal(raw: unknown): Promise<Result<{ goalId: string; dayOfGoal: number }>> {
  const { clientId, workspaceId, by } = await me();
  const parsed = StartInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Something in that doesn't look right." };
  const input = parsed.data;
  const template = templateByKey(input.templateKey);
  if (!template) return { ok: false, error: "Unknown goal." };

  const timeZone = safeTimeZone(cookies().get(TZ_COOKIE)?.value);
  const today = localDay(new Date(), timeZone);
  const preview = confirmStart(input.startDay, today, template.rules.length.days, input.shownDay);
  if (!preview.ok) return preview;

  if (await prisma.goal.findFirst({ where: { clientId, status: "ACTIVE" }, select: { id: true } })) return { ok: false, error: "You already have a goal running." };

  // The challenge's own rules, as written; only the diet's wording is the person's. Days before today that count as done are carried.
  const diet = input.diet || DEFAULT_DIET;
  const rules = GoalRules.parse({
    ...template.rules,
    rules: template.rules.rules.map((r) => (r.key === DIET_KEY && r.kind === "check_in" ? { ...r, detail: diet } : r)),
    ...(preview.carriedDays > 0 ? { carriedThrough: addDays(today, -1) } : {}),
  });

  const goal = await prisma.goal.create({
    data: { workspaceId, clientId, templateKey: template.key, name: template.name, category: template.category, rules, timeZone, startDay: input.startDay, startedBy: by },
    select: { id: true },
  });
  refresh();
  return { ok: true, goalId: goal.id, dayOfGoal: preview.dayOfGoal };
}

const TickInput = z.object({ goalId: Id, ruleKey: Key, day: Day, on: z.boolean() });

/** Tick (or untick) a daily rule. */
export async function tickRule(raw: unknown): Promise<Result> {
  const { clientId, by } = await me();
  const input = TickInput.parse(raw);
  const { goal, rules, today } = await ownActiveGoal(input.goalId, clientId);
  const rule = rules.rules.find((r) => r.key === input.ruleKey);
  if (!rule || rule.kind !== "check_in" || !ruleActiveOn(rule, input.day)) return { ok: false, error: "That isn't something to tick." };
  const blocked = editable(input.day, today, goal.startDay, rules);
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
  const blocked = editable(day, today, goal.startDay, rules);
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

const LogWorkoutInput = z.object({ goalId: Id, minutes: WorkoutMinutes, outdoors: z.boolean().default(false), day: Day.optional() });

/**
 * One tap on an empty workout row: log "Workout, N min" as a finished session with no sets, on
 * the goal's today (or a day that can still be changed), optionally tagged (outdoors) in the same step.
 */
export async function logWorkout(raw: unknown): Promise<Result<{ sessionId: string }>> {
  const { clientId, workspaceId, by } = await me();
  const input = LogWorkoutInput.parse(raw);
  const { goal, rules, today } = await ownActiveGoal(input.goalId, clientId);
  const day = input.day ?? today;
  const blocked = editable(day, today, goal.startDay, rules);
  if (blocked) return { ok: false, error: blocked };
  const mark = input.outdoors ? rules.rules.flatMap((r) => (r.kind === "sessions" && r.where.mark ? [r.where.mark] : []))[0] : undefined;
  if (input.outdoors && !mark) return { ok: false, error: "This goal doesn't use that tag." };

  const session = await prisma.workoutLog.create({
    data: { clientId, source: "OFF_PLAN", title: "Workout", date: dayToDate(day, goal.timeZone), completedAt: new Date(), durationMin: input.minutes, trainerSeen: by === "TRAINER" },
    select: { id: true },
  });
  if (mark) await prisma.goalCheckIn.create({ data: { goalId: goal.id, ruleKey: mark, day, workoutLogId: session.id, by } });
  await prisma.clientProfile.update({ where: { id: clientId }, data: { lastContactAt: new Date() } });
  checkSessionMilestones(workspaceId, clientId).catch((err: unknown) => console.error("[milestones] session check:", err));
  refresh(goal.id);
  return { ok: true, sessionId: session.id };
}

/** Where a workout of this client's sits on the goal's calendar, or why it can't be changed any more. */
async function changeableWorkout(goalId: string, sessionId: string, clientId: string, extra: Prisma.WorkoutLogWhereInput = {}) {
  const { goal, rules, today } = await ownActiveGoal(goalId, clientId);
  const s = await prisma.workoutLog.findFirst({ where: { id: Id.parse(sessionId), clientId, completedAt: { not: null }, ...extra }, select: { id: true, date: true } });
  if (!s) return { ok: false as const, error: "That workout isn't there." };
  const blocked = editable(localDay(s.date, goal.timeZone), today, goal.startDay, rules);
  return blocked ? { ok: false as const, error: blocked } : { ok: true as const, goal, session: s };
}

/**
 * Undo or remove a one-tap workout. Only a workout with no sets can go (nothing is lost): one
 * logged by hand with sets is edited, not removed, from here. Its tags go with it.
 */
export async function removeWorkout(raw: unknown): Promise<Result> {
  const { clientId } = await me();
  const input = z.object({ goalId: Id, sessionId: Id }).parse(raw);
  const found = await changeableWorkout(input.goalId, input.sessionId, clientId, { source: "OFF_PLAN", sets: { none: {} } });
  if (!found.ok) return found.error === "That workout isn't there." ? { ok: false, error: "That workout can't be removed here." } : found;
  await prisma.$transaction([prisma.goalCheckIn.deleteMany({ where: { workoutLogId: found.session.id } }), prisma.workoutLog.delete({ where: { id: found.session.id } })]);
  refresh(found.goal.id);
  return { ok: true };
}

/** Change what the diet says. Wording only: it is never judged, so no day's result moves. */
export async function setDiet(raw: unknown): Promise<Result> {
  const { clientId } = await me();
  const input = z.object({ goalId: Id, diet: Diet }).parse(raw);
  const { goal, rules } = await ownActiveGoal(input.goalId, clientId);
  const diet = input.diet || DEFAULT_DIET;
  if (!rules.rules.some((r) => r.key === DIET_KEY && r.kind === "check_in")) return { ok: false, error: "This goal has no diet to edit." };
  const next = GoalRules.parse({ ...rules, rules: rules.rules.map((r) => (r.key === DIET_KEY && r.kind === "check_in" ? { ...r, detail: diet } : r)) });
  await prisma.goal.update({ where: { id: goal.id }, data: { rules: next } });
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
  revalidatePath("/you");
  return { ok: true };
}

/** Remove a goal for good (running or finished), with its check-ins. Only your own. Its chip comes off Today. */
export async function deleteGoal(raw: unknown): Promise<Result> {
  const { clientId } = await me();
  const { goalId } = z.object({ goalId: Id }).parse(raw);
  const gone = await prisma.goal.deleteMany({ where: { id: goalId, clientId } });
  if (gone.count === 0) return { ok: false, error: "That goal isn't there." };
  refresh();
  revalidatePath("/you");
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
