-- Exercises added during a session: [{ exerciseId, name, aweId, prescribedSets? }], so the next time the same workout
-- opens it can offer them again. Additive: one nullable column, no default, no backfill. Older code never reads it.
ALTER TABLE "WorkoutLog" ADD COLUMN "addedExercises" JSONB;
