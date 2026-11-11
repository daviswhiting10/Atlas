-- Plans become editable and carry the goal they were built from.
-- Additive: two nullable columns. Existing plans keep working unchanged.
ALTER TABLE "ProgramAssignment" ADD COLUMN "goalText" TEXT;
ALTER TABLE "ProgramAssignment" ADD COLUMN "notes" TEXT;

-- AssignedWorkout.notes now belongs to the person training. Until now the
-- generator wrote its own lighter-week reminder there; that reminder is
-- derived from the week number instead, so clear the generated text (and only
-- that text) to leave the field empty for real notes.
UPDATE "AssignedWorkout"
SET "notes" = NULL
WHERE "notes" LIKE 'Lighter week — %';
