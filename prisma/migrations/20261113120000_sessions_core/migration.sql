-- Sessions become the core record (step 1 of 2). Additive only: code that
-- predates it keeps working (source has a default until step 2).

CREATE TYPE "SessionSource" AS ENUM ('PLAN', 'GENERATED', 'MANUAL', 'SCREENSHOT', 'OFF_PLAN');

ALTER TABLE "WorkoutLog"
  ADD COLUMN "source"      "SessionSource" NOT NULL DEFAULT 'PLAN',
  ADD COLUMN "title"       TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

-- Where each existing session came from: a generated plan (Program.isTemplate = false),
-- any other plan, or no plan any more (its plan was deleted).
UPDATE "WorkoutLog" l
SET "source" = CASE WHEN p."isTemplate" THEN 'PLAN'::"SessionSource" ELSE 'GENERATED'::"SessionSource" END
FROM "AssignedWorkout" aw
JOIN "ProgramAssignment" pa ON pa.id = aw."programAssignmentId"
JOIN "Program" p ON p.id = pa."sourceProgramId"
WHERE aw.id = l."assignedWorkoutId";

UPDATE "WorkoutLog" SET "source" = 'OFF_PLAN' WHERE "assignedWorkoutId" IS NULL;

-- A plan workout marked done that has no session (marked complete without sets):
-- it gets a finished session with no sets, so it stays done.
INSERT INTO "WorkoutLog" ("id", "clientId", "assignedWorkoutId", "source", "date", "completedAt", "trainerSeen", "createdAt")
SELECT 'wl_' || md5(aw.id), pa."clientId", aw.id,
       CASE WHEN p."isTemplate" THEN 'PLAN'::"SessionSource" ELSE 'GENERATED'::"SessionSource" END,
       aw."scheduledDate", aw."scheduledDate", true, CURRENT_TIMESTAMP
FROM "AssignedWorkout" aw
JOIN "ProgramAssignment" pa ON pa.id = aw."programAssignmentId"
JOIN "Program" p ON p.id = pa."sourceProgramId"
WHERE aw.status = 'LOGGED'
  AND NOT EXISTS (SELECT 1 FROM "WorkoutLog" l WHERE l."assignedWorkoutId" = aw.id);

-- Finished: plan sessions whose workout was marked done, and every session whose
-- plan is gone. When: the last set entered, else when the session was created.
UPDATE "WorkoutLog" l
SET "completedAt" = GREATEST(l."createdAt", COALESCE((SELECT max(s."createdAt") FROM "SetLog" s WHERE s."workoutLogId" = l.id), l."createdAt"))
WHERE l."completedAt" IS NULL
  AND (l."assignedWorkoutId" IS NULL
       OR EXISTS (SELECT 1 FROM "AssignedWorkout" aw WHERE aw.id = l."assignedWorkoutId" AND aw.status = 'LOGGED'));

CREATE INDEX "WorkoutLog_clientId_date_idx" ON "WorkoutLog"("clientId", "date");
