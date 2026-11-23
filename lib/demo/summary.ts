"use server";

/** The History day sheet on /demo: a session's lines from the sample (no account, no database). */
import type { SessionSummary } from "@/lib/actions/athlete";
import { DEMO_EXERCISE_NAMES, DEMO_SESSIONS } from "./sample";

export async function demoSessionSummary(id: string): Promise<SessionSummary | null> {
  const s = DEMO_SESSIONS.find((x) => x.id === id);
  if (!s) return null;
  const by = new Map<string, string[]>();
  for (const set of s.sets) {
    if (!set.exerciseId) continue;
    const list = by.get(set.exerciseId) ?? [];
    list.push(set.weight ? `${set.weight} × ${set.reps}` : `${set.reps}`);
    by.set(set.exerciseId, list);
  }
  return { lines: Array.from(by, ([exerciseId, sets]) => ({ name: DEMO_EXERCISE_NAMES[exerciseId] ?? "Exercise", sets: sets.join(", ") })) };
}
