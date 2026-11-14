/**
 * Loading a goal for the screens. The judging is lib/goals/evaluate.ts; this
 * adds the database reads and the two things that happen "on read" because
 * there is no daily job:
 *
 * - a goal that has used up its days (and whose last day has closed) becomes
 *   COMPLETED, with endedAt at the end of that last day;
 * - an ended goal's chapter is a draft until 48 hours after it ended, then it
 *   is sealed on the next read. Both writes are conditional, so two readers
 *   arriving together change it once.
 */

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { localDay } from "@/lib/athlete/sessions";
import { freezeChapter, type Chapter } from "./chapter";
import { endOfDay } from "./days";
import { evaluateGoal, type CheckInInput, type GoalResult } from "./evaluate";
import { GoalRules } from "./rules";
import type { GoalCategory } from "./templates";

const HOUR = 3_600_000;
export const SEAL_AFTER_HOURS = 48;

export type GoalRow = {
  id: string;
  clientId: string;
  name: string;
  category: GoalCategory;
  templateKey: string | null;
  timeZone: string;
  startDay: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "ENDED";
  endedAt: Date | null;
  rules: GoalRules;
};

export type GoalSession = { id: string; date: Date; day: string; title: string | null; durationMin: number | null; sets: number };

export type LoadedGoal = {
  goal: GoalRow;
  result: GoalResult;
  /** Finished sessions on or after the goal's start (a day either side of it, for timezones). */
  sessions: GoalSession[];
  checkIns: Array<CheckInInput & { id: string }>;
  /** Set once the goal has ended: sealed, or a draft drawn live. */
  chapter: Chapter | null;
  sealed: boolean;
  /** When a draft seals by itself. */
  sealsAt: Date | null;
};

function toRow(g: { id: string; clientId: string; name: string; category: string; templateKey: string | null; timeZone: string; startDay: string; status: GoalRow["status"]; endedAt: Date | null; rules: Prisma.JsonValue }): GoalRow {
  return { ...g, category: g.category as GoalCategory, rules: GoalRules.parse(g.rules) };
}

async function finishedSessions(clientId: string, startDay: string, endedAt: Date | null): Promise<GoalSession[]> {
  const from = new Date(Date.parse(`${startDay}T00:00:00Z`) - 86_400_000);
  // A goal that has ended doesn't look at anything after it (a day of slack for timezones).
  const to = endedAt ? new Date(endedAt.getTime() + 36 * HOUR) : null;
  const rows = await prisma.workoutLog.findMany({
    where: { clientId, completedAt: { not: null }, date: { gte: from, ...(to ? { lte: to } : {}) } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, title: true, durationMin: true, _count: { select: { sets: true } } },
  });
  return rows.map((s) => ({ id: s.id, date: s.date, day: "", title: s.title, durationMin: s.durationMin, sets: s._count.sets }));
}

/** A goal with its result, closing and sealing it first if its time has come. */
export async function loadGoal(goalId: string, clientId: string, now = new Date()): Promise<LoadedGoal | null> {
  const row = await prisma.goal.findFirst({ where: { id: goalId, clientId }, include: { checkIns: { orderBy: { createdAt: "asc" } } } });
  if (!row) return null;

  let goal = toRow(row);
  // The sessions are always loaded: even a sealed chapter shows the live list underneath.
  const sessions = (await finishedSessions(clientId, goal.startDay, goal.endedAt)).map((s) => ({ ...s, day: localDay(s.date, goal.timeZone) }));
  const checkIns = row.checkIns.map((c) => ({ id: c.id, ruleKey: c.ruleKey, day: c.day, workoutLogId: c.workoutLogId, excuse: c.excuse }));

  const live = () => evaluateGoal(goal, sessions, checkIns, now, goal.endedAt ? { lastDay: localDay(goal.endedAt, goal.timeZone) } : {});
  let result = live();

  // Used up its days: close it, as of the end of its last day.
  if (goal.status === "ACTIVE" && result.completedOn) {
    const endedAt = endOfDay(result.completedOn, goal.timeZone);
    await prisma.goal.updateMany({ where: { id: goal.id, status: "ACTIVE" }, data: { status: "COMPLETED", endedAt } });
    goal = { ...goal, status: "COMPLETED", endedAt };
    result = live();
  }

  let chapter: Chapter | null = null;
  let sealed = false;
  let sealsAt: Date | null = null;
  if (goal.endedAt && goal.status !== "ACTIVE") {
    if (row.chapter != null) {
      chapter = row.chapter as unknown as Chapter;
      sealed = true;
    } else {
      chapter = freezeChapter({ ...goal, endedAt: goal.endedAt }, sessions, checkIns, now);
      sealsAt = new Date(goal.endedAt.getTime() + SEAL_AFTER_HOURS * HOUR);
      if (now >= sealsAt) sealed = await writeChapter(goal.id, chapter);
    }
  }
  return { goal, result, sessions, checkIns, chapter, sealed, sealsAt: sealed ? null : sealsAt };
}

/** Write the chapter once. Returns whether this call (or an earlier one) sealed it. */
async function writeChapter(goalId: string, chapter: Chapter): Promise<boolean> {
  await prisma.goal.updateMany({ where: { id: goalId, chapter: { equals: Prisma.DbNull } }, data: { chapter: chapter as unknown as Prisma.InputJsonValue } });
  return true;
}

/** "Seal now": the draft becomes the record straight away. Only for a goal that has ended. */
export async function sealNow(goalId: string, clientId: string, now = new Date()): Promise<boolean> {
  const loaded = await loadGoal(goalId, clientId, now);
  if (!loaded?.chapter || loaded.goal.status === "ACTIVE") return false;
  if (loaded.sealed) return true;
  return writeChapter(goalId, loaded.chapter);
}

/** The goal running now, if any. One at a time for now. */
export async function activeGoalId(clientId: string): Promise<string | null> {
  const g = await prisma.goal.findFirst({ where: { clientId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return g?.id ?? null;
}

/** Goals that have ended, newest first, for the chapters list. */
export async function endedGoals(clientId: string) {
  return prisma.goal.findMany({
    where: { clientId, status: { in: ["COMPLETED", "ENDED"] } },
    orderBy: { endedAt: "desc" },
    select: { id: true, name: true, status: true, startDay: true, endedAt: true, chapter: true },
  });
}
