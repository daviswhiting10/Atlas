-- CreateEnum
CREATE TYPE "OptPhase" AS ENUM ('STABILIZATION_ENDURANCE', 'STRENGTH_ENDURANCE', 'HYPERTROPHY', 'MAX_STRENGTH', 'POWER');

-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "phase" "OptPhase";

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkoutExercise" ADD COLUMN     "section" TEXT;
