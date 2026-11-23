/**
 * The plain session data the history functions take. Nothing here knows about
 * Prisma: a caller maps its rows to these shapes (see docs/archive-and-chapters.md).
 *
 * `date` is the instant the session was done (never the scheduled day, never
 * when it was logged). `completedAt` is set once the session is finished; the
 * functions in this folder only look at finished sessions.
 */

export type HistorySet = {
  exerciseId: string | null;
  /** lb; null or 0 = bodyweight, band or timed work. */
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  bandColor?: string | null;
  /** When the set was of a plan exercise logged as cardio: what kind. Such a set is not strength work. */
  cardio?: "RUN" | "WALK" | "OTHER" | null;
  completed: boolean;
};

export type HistorySession = {
  id: string;
  date: Date;
  completedAt: Date | null;
  durationMin: number | null;
  /** A quick log of cardio or a walk (no plan exercise behind it): what it was. */
  activity?: "RUN" | "WALK" | "OTHER" | null;
  sets: HistorySet[];
};
