-- workout_logger_schema
-- Adds structured workout logging support:
--   1. WorkoutLog.assignedWorkoutId  — links a log session to an AssignedWorkout
--   2. SetLog.exerciseId             — which exercise each set was for
--   3. SetLog.assignedWorkoutExerciseId — link back to the prescription
--   4. SetLog.rpe                    — per-set RPE
--   5. ExerciseCoachNote             — per-exercise coach observations (persists across programs)

-- 1. WorkoutLog: add assignedWorkoutId (nullable, unique FK → AssignedWorkout)
ALTER TABLE "WorkoutLog" ADD COLUMN "assignedWorkoutId" TEXT;
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_assignedWorkoutId_key" UNIQUE ("assignedWorkoutId");
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_assignedWorkoutId_fkey"
  FOREIGN KEY ("assignedWorkoutId") REFERENCES "AssignedWorkout"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. SetLog: add exerciseId (nullable FK → Exercise)
ALTER TABLE "SetLog" ADD COLUMN "exerciseId" TEXT;
ALTER TABLE "SetLog" ADD CONSTRAINT "SetLog_exerciseId_fkey"
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. SetLog: add assignedWorkoutExerciseId (nullable FK → AssignedWorkoutExercise)
ALTER TABLE "SetLog" ADD COLUMN "assignedWorkoutExerciseId" TEXT;
ALTER TABLE "SetLog" ADD CONSTRAINT "SetLog_assignedWorkoutExerciseId_fkey"
  FOREIGN KEY ("assignedWorkoutExerciseId") REFERENCES "AssignedWorkoutExercise"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. SetLog: add rpe (nullable Float)
ALTER TABLE "SetLog" ADD COLUMN "rpe" DOUBLE PRECISION;

-- 5. Index on SetLog(exerciseId, workoutLogId) for last-performance queries
CREATE INDEX "SetLog_exerciseId_workoutLogId_idx" ON "SetLog"("exerciseId", "workoutLogId");

-- 6. ExerciseCoachNote table
CREATE TABLE "ExerciseCoachNote" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "clientId"    TEXT NOT NULL,
  "exerciseId"  TEXT NOT NULL,
  "note"        TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExerciseCoachNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExerciseCoachNote" ADD CONSTRAINT "ExerciseCoachNote_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExerciseCoachNote" ADD CONSTRAINT "ExerciseCoachNote_exerciseId_fkey"
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ExerciseCoachNote_clientId_exerciseId_idx" ON "ExerciseCoachNote"("clientId", "exerciseId");
