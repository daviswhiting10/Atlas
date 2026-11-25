/**
 * A finished session's sets for the read-only summary (the athlete's Plan calendar and History, and the coach's chart on
 * the client page): each exercise with what was done, in the order it was done, plus the session's notes by author.
 * The caller decides whose it may be: `where` already carries the client (and workspace) check.
 */
import { prisma } from "@/lib/db/client";
import { displayName } from "@/lib/plan/catalog";
import { loadSessionNotes } from "@/lib/sessions/notes";
import type { Prisma } from "@/app/generated/prisma/client";
import type { SessionSummary } from "@/lib/actions/athlete";

export async function buildSessionSummary(where: Prisma.WorkoutLogWhereInput, athleteLabel: string): Promise<SessionSummary | null> {
  const log = await prisma.workoutLog.findFirst({
    where,
    select: {
      id: true,
      clientNotes: true,
      durationMin: true,
      date: true,
      sets: {
        where: { completed: true },
        orderBy: [{ createdAt: "asc" }, { setNumber: "asc" }],
        select: {
          weight: true,
          reps: true,
          exercise: { select: { name: true, slug: true } },
          assignedWorkoutExercise: { select: { prescribedSets: true } },
        },
      },
    },
  });
  if (!log) return null;
  const byName = new Map<string, string[]>();
  for (const s of log.sets) {
    if (!s.exercise || s.reps == null) continue;
    const name = displayName(s.exercise.slug, s.exercise.name);
    const timed = ((s.assignedWorkoutExercise?.prescribedSets as Array<{ unit?: string }> | null) ?? [])[0]?.unit === "secs";
    const text = timed ? `${s.reps} sec` : s.weight != null && s.weight > 0 ? `${s.weight}×${s.reps}` : `${s.reps}`;
    byName.set(name, [...(byName.get(name) ?? []), text]);
  }
  const notes = (await loadSessionNotes([{ id: log.id, clientNotes: log.clientNotes }])).get(log.id)!;
  return {
    lines: Array.from(byName, ([name, sets]) => ({ name, sets: sets.join(", ") })),
    setCount: log.sets.length,
    minutes: log.durationMin,
    date: log.date.toISOString().slice(0, 10),
    notes: [...(notes.coach ? [{ label: "Coach", text: notes.coach }] : []), ...(notes.athlete ? [{ label: athleteLabel, text: notes.athlete }] : [])],
  };
}
