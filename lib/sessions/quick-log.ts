/**
 * Quick log: a workout done outside any plan, logged after the fact in one
 * save. These are the rules the screen and the save action share.
 *
 * Pure: no I/O.
 */

import { z } from "zod";

export const QUICK_LIMITS = { exercises: 30, sets: 20, title: 80, notes: 2000, name: 120, duration: 600, weight: 2000, reps: 1000 } as const;
export const BANDS = ["yellow", "red", "green", "blue", "black", "purple"] as const;

const num = (max: number) => z.number().finite().min(0).max(max).nullable();

export const QuickSessionInput = z.object({
  /** For a coach; an athlete's own client comes from their sign-in. */
  clientId: z.string().min(1).max(64).optional(),
  /** Editing an off-plan session already saved. */
  sessionId: z.string().min(1).max(64).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().max(QUICK_LIMITS.title).optional(),
  notes: z.string().trim().max(QUICK_LIMITS.notes).optional(),
  durationMin: z.number().int().min(1).max(QUICK_LIMITS.duration).nullable().optional(),
  exercises: z
    .array(
      z.object({
        /** A library exercise; null for a name typed as is (step 4 matches these). */
        exerciseId: z.string().min(1).max(64).nullable(),
        name: z.string().trim().min(1).max(QUICK_LIMITS.name),
        sets: z.array(z.object({ weight: num(QUICK_LIMITS.weight), reps: num(QUICK_LIMITS.reps), band: z.enum(BANDS).nullable() })).max(QUICK_LIMITS.sets),
      })
    )
    .min(1)
    .max(QUICK_LIMITS.exercises),
});
export type QuickSessionInput = z.infer<typeof QuickSessionInput>;

export type QuickSet = { weight: number | null; reps: number | null; band: (typeof BANDS)[number] | null };

/**
 * What gets saved: a set counts once it has reps (or seconds); weight is
 * optional (bodyweight, bands). Exercises left with no sets are dropped.
 */
export function cleanSession(input: QuickSessionInput) {
  const exercises = input.exercises
    .map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name.replace(/\s+/g, " ").trim(),
      sets: e.sets
        .filter((s) => s.reps != null && s.reps > 0)
        .map((s) => ({ weight: s.weight != null && s.weight > 0 ? round(s.weight, 2) : null, reps: Math.round(s.reps as number), band: s.band })),
    }))
    .filter((e) => e.sets.length > 0);
  return {
    exercises,
    totalSets: exercises.reduce((n, e) => n + e.sets.length, 0),
    title: input.title?.trim() || null,
    notes: input.notes?.trim() || null,
    durationMin: input.durationMin ?? null,
  };
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

// ── Search ────────────────────────────────────────────────────────────────────

const SHORT: Record<string, string> = { db: "dumbbell", dbs: "dumbbell", bb: "barbell", kb: "kettlebell", kbs: "kettlebell", sl: "single leg", rdl: "romanian deadlift", ohp: "overhead press", bw: "bodyweight" };

/** What the user typed, as words to find: "db ro" → ["dumbbell", "ro"]. */
export function searchTokens(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .flatMap((w) => (SHORT[w] ?? w).split(" "));
}

/** Every word appears in the name ("db ro" finds Dumbbell Row and Dumbbell Romanian Deadlift). */
export function matchesTokens(name: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const n = name.toLowerCase();
  return tokens.every((t) => n.includes(t));
}

// ── Last time ─────────────────────────────────────────────────────────────────

export type LastTime = { date: string; unit: "reps" | "secs"; sets: QuickSet[] };

/** "3 × 10 @ 45 lb", "10, 8, 6 @ 45 lb", "3 × 45 s", "3 × 12 · blue band". */
export function describeLast(last: LastTime): string {
  const sets = last.sets.filter((s) => s.reps != null);
  if (sets.length === 0) return "";
  const unit = last.unit === "secs" ? " s" : "";
  const reps = sets.map((s) => s.reps);
  const sameReps = reps.every((r) => r === reps[0]);
  const count = sameReps ? `${sets.length} × ${reps[0]}${unit}` : `${reps.join(", ")}${unit}`;
  const weights = Array.from(new Set(sets.map((s) => s.weight).filter((w): w is number => w != null)));
  const bands = Array.from(new Set(sets.map((s) => s.band).filter(Boolean)));
  if (weights.length > 0) return `${count} @ ${weights.length === 1 ? weights[0] : `${Math.min(...weights)}–${Math.max(...weights)}`} lb`;
  if (bands.length > 0) return `${count} · ${bands.join("/")} band`;
  return count;
}

/** The rows a new exercise starts with: last time's sets, or 3 empty ones. */
export function prefillSets(last: LastTime | null): QuickSet[] {
  const sets = last?.sets.filter((s) => s.reps != null) ?? [];
  if (sets.length === 0) return [0, 1, 2].map(() => ({ weight: null, reps: null, band: null }));
  return sets.slice(0, QUICK_LIMITS.sets).map((s) => ({ weight: s.weight, reps: s.reps, band: s.band }));
}
