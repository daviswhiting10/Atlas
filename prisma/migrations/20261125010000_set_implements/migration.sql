-- Bells held for a dumbbell or kettlebell set (2 = per hand, 1 = one bell). Additive: one nullable column, no default,
-- no backfill (null = not recorded, counted as one bell). Older code never reads it.
ALTER TABLE "SetLog" ADD COLUMN "implements" INTEGER;
