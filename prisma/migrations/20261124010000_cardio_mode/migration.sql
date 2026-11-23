-- CreateEnum
CREATE TYPE "ExerciseMode" AS ENUM ('STRENGTH', 'CARDIO');

-- CreateEnum
CREATE TYPE "CardioActivity" AS ENUM ('RUN', 'WALK', 'OTHER');

-- AlterTable
ALTER TABLE "AssignedWorkoutExercise" ADD COLUMN     "activity" "CardioActivity",
ADD COLUMN     "mode" "ExerciseMode" NOT NULL DEFAULT 'STRENGTH';

-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "activity" "CardioActivity",
ADD COLUMN     "distanceM" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SetLog" ADD COLUMN     "distanceM" DOUBLE PRECISION,
ADD COLUMN     "splits" JSONB;

