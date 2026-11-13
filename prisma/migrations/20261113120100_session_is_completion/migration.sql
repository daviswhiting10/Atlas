-- Sessions become the core record (step 2 of 2). Apply after the code that
-- reads completion from sessions is live.

-- Anything finished by older code since step 1 (status LOGGED, no completedAt).
INSERT INTO "WorkoutLog" ("id", "clientId", "assignedWorkoutId", "source", "date", "completedAt", "trainerSeen", "createdAt")
SELECT 'wl_' || md5(aw.id), pa."clientId", aw.id,
       CASE WHEN p."isTemplate" THEN 'PLAN'::"SessionSource" ELSE 'GENERATED'::"SessionSource" END,
       aw."scheduledDate", aw."scheduledDate", true, CURRENT_TIMESTAMP
FROM "AssignedWorkout" aw
JOIN "ProgramAssignment" pa ON pa.id = aw."programAssignmentId"
JOIN "Program" p ON p.id = pa."sourceProgramId"
WHERE aw.status = 'LOGGED'
  AND NOT EXISTS (SELECT 1 FROM "WorkoutLog" l WHERE l."assignedWorkoutId" = aw.id);

UPDATE "WorkoutLog" l
SET "completedAt" = GREATEST(l."createdAt", COALESCE((SELECT max(s."createdAt") FROM "SetLog" s WHERE s."workoutLogId" = l.id), l."createdAt"))
WHERE l."completedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "AssignedWorkout" aw WHERE aw.id = l."assignedWorkoutId" AND aw.status = 'LOGGED');

-- "Done" now lives only on the session.
UPDATE "AssignedWorkout" SET "status" = 'PLANNED' WHERE "status" = 'LOGGED';
ALTER TABLE "AssignedWorkout" ADD CONSTRAINT "AssignedWorkout_status_not_logged" CHECK ("status" <> 'LOGGED');

-- Every new session says where it came from.
ALTER TABLE "WorkoutLog" ALTER COLUMN "source" DROP DEFAULT;
