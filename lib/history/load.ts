/**
 * Loads one client's History calendar: their finished sessions (with sets, or
 * none) and finished goals, mapped to the plain shapes in ./types and handed to
 * historyCalendar(). The only file in lib/history that touches the database.
 *
 * Scoped to one client in one workspace; the caller has already checked who is
 * asking. Days are read in the request's timezone (the cookie) for now.
 */

import { localDay } from "@/lib/athlete/sessions";
import { prisma } from "@/lib/db/client";
import { activeGoalId, loadGoal } from "@/lib/goals/data";
import { chapterSpan, historyCalendar, type Challenge, type HistoryCalendar } from "./calendar";
import type { HistorySession } from "./types";

/** Where a session opens: the athlete's own pages, or the coach's session page. */
export type Viewer = { kind: "athlete" } | { kind: "coach"; clientId: string };

type Row = { id: string; assignedWorkoutId: string | null; source: string };

/** null: there is no page for it (an imported session, for the athlete). */
export function sessionHref(viewer: Viewer, s: Row): string | null {
  if (viewer.kind === "coach") return `/clients/${viewer.clientId}/sessions/${s.id}`;
  if (s.assignedWorkoutId) return `/workouts/${s.assignedWorkoutId}`;
  if (s.source === "OFF_PLAN") return `/workouts/new?session=${s.id}`;
  return null;
}

export async function loadCalendar({ clientId, workspaceId, timeZone, viewer }: { clientId: string; workspaceId: string; timeZone: string; viewer: Viewer }): Promise<HistoryCalendar> {
  const [rows, goals, challenge] = await Promise.all([
    prisma.workoutLog.findMany({
      where: { clientId, client: { workspaceId }, completedAt: { not: null } },
      select: {
        id: true,
        date: true,
        completedAt: true,
        durationMin: true,
        activity: true,
        title: true,
        source: true,
        assignedWorkoutId: true,
        assignedWorkout: { select: { name: true } },
        sets: { select: { exerciseId: true, weight: true, reps: true, rpe: true, bandColor: true, completed: true, assignedWorkoutExercise: { select: { mode: true, activity: true } } } },
      },
    }),
    prisma.goal.findMany({
      where: { clientId, client: { workspaceId }, status: { in: ["COMPLETED", "ENDED"] } },
      select: { name: true, startDay: true, endedAt: true },
    }),
    loadChallenge(clientId),
  ]);

  const sessions: HistorySession[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    completedAt: r.completedAt,
    durationMin: r.durationMin,
    activity: r.activity,
    // A set of a plan exercise logged as cardio says what kind (and is not strength work).
    sets: r.sets.map(({ assignedWorkoutExercise: awe, ...set }) => ({ ...set, cardio: awe?.mode === "CARDIO" ? (awe.activity ?? "OTHER") : null })),
  }));
  const meta = Object.fromEntries(rows.map((r) => [r.id, { title: r.title ?? r.assignedWorkout?.name ?? "Workout", href: sessionHref(viewer, r) }]));
  const today = localDay(new Date(), timeZone);
  return historyCalendar(sessions, { timeZone, today, meta, chapters: goals.map((g) => chapterSpan(g, timeZone, today)), challenge });
}

/** The running goal's days for the heatmap's ring: met, or open (a missed day, or one still going). */
async function loadChallenge(clientId: string): Promise<Challenge | null> {
  const id = await activeGoalId(clientId);
  const loaded = id ? await loadGoal(id, clientId) : null;
  if (!loaded || loaded.goal.status !== "ACTIVE") return null;
  return { name: loaded.goal.name, days: Object.fromEntries(loaded.result.periods.map((p) => [p.day, p.state === "met" ? ("met" as const) : ("open" as const)])) };
}
