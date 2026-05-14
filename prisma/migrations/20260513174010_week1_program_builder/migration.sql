/*
  Warnings:

  - You are about to drop the column `cues` on the `Exercise` table. All the data in the column will be lost.
  - You are about to drop the column `muscleGroups` on the `Exercise` table. All the data in the column will be lost.
  - You are about to drop the column `pattern` on the `Exercise` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `Program` table. All the data in the column will be lost.
  - You are about to drop the column `goal` on the `Program` table. All the data in the column will be lost.
  - You are about to drop the column `markdownBlob` on the `Program` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Program` table. All the data in the column will be lost.
  - You are about to drop the column `structure` on the `Program` table. All the data in the column will be lost.
  - You are about to drop the column `exercisePrescriptionId` on the `SetLog` table. All the data in the column will be lost.
  - You are about to drop the column `workoutTemplateId` on the `WorkoutLog` table. All the data in the column will be lost.
  - You are about to drop the `ExercisePrescription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProgramBlock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WorkoutTemplate` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `instructions` to the `Exercise` table without a default value. This is not possible if the table is not empty.
  - Added the required column `movementPattern` to the `Exercise` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primaryMuscles` to the `Exercise` table without a default value. This is not possible if the table is not empty.
  - Added the required column `secondaryMuscles` to the `Exercise` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workspaceId` to the `Program` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MovementPattern" AS ENUM ('SQUAT', 'HINGE', 'HORIZONTAL_PUSH', 'VERTICAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PULL', 'LUNGE', 'CARRY', 'ROTATION', 'ANTI_ROTATION', 'LOCOMOTION');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LoggedBy" AS ENUM ('TRAINER', 'CLIENT');

-- CreateEnum
CREATE TYPE "WorkoutStatus" AS ENUM ('PLANNED', 'LOGGED', 'SKIPPED', 'RESCHEDULED');

-- DropForeignKey
ALTER TABLE "ExercisePrescription" DROP CONSTRAINT "ExercisePrescription_exerciseId_fkey";

-- DropForeignKey
ALTER TABLE "ExercisePrescription" DROP CONSTRAINT "ExercisePrescription_workoutTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "Program" DROP CONSTRAINT "Program_clientId_fkey";

-- DropForeignKey
ALTER TABLE "ProgramBlock" DROP CONSTRAINT "ProgramBlock_programId_fkey";

-- DropForeignKey
ALTER TABLE "SetLog" DROP CONSTRAINT "SetLog_exercisePrescriptionId_fkey";

-- DropForeignKey
ALTER TABLE "WorkoutLog" DROP CONSTRAINT "WorkoutLog_workoutTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "WorkoutTemplate" DROP CONSTRAINT "WorkoutTemplate_blockId_fkey";

-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "cues",
DROP COLUMN "muscleGroups",
DROP COLUMN "pattern",
ADD COLUMN     "coachingCues" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "gifUrl" TEXT,
ADD COLUMN     "instructions" JSONB NOT NULL,
ADD COLUMN     "movementPattern" "MovementPattern" NOT NULL,
ADD COLUMN     "primaryMuscles" JSONB NOT NULL,
ADD COLUMN     "secondaryMuscles" JSONB NOT NULL,
ALTER COLUMN "equipment" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Program" DROP COLUMN "clientId",
DROP COLUMN "goal",
DROP COLUMN "markdownBlob",
DROP COLUMN "status",
DROP COLUMN "structure",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "goalTags" JSONB,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SetLog" DROP COLUMN "exercisePrescriptionId";

-- AlterTable
ALTER TABLE "WorkoutLog" DROP COLUMN "workoutTemplateId";

-- DropTable
DROP TABLE "ExercisePrescription";

-- DropTable
DROP TABLE "ProgramBlock";

-- DropTable
DROP TABLE "WorkoutTemplate";

-- DropEnum
DROP TYPE "ProgramStatus";

-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "blockId" TEXT,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "order" INTEGER,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateName" TEXT,
    "templateTags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExercise" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "prescribedSets" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "WorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "weeks" INTEGER NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAssignment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourceProgramId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignedWorkout" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "programAssignmentId" TEXT NOT NULL,
    "sourceWorkoutId" TEXT,
    "name" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "loggedBy" "LoggedBy" NOT NULL DEFAULT 'TRAINER',
    "status" "WorkoutStatus" NOT NULL DEFAULT 'PLANNED',
    "order" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "AssignedWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignedWorkoutExercise" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assignedWorkoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "prescribedSets" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "AssignedWorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutExercise_workoutId_order_idx" ON "WorkoutExercise"("workoutId", "order");

-- CreateIndex
CREATE INDEX "Block_programId_order_idx" ON "Block"("programId", "order");

-- CreateIndex
CREATE INDEX "ProgramAssignment_workspaceId_clientId_status_idx" ON "ProgramAssignment"("workspaceId", "clientId", "status");

-- CreateIndex
CREATE INDEX "AssignedWorkout_programAssignmentId_scheduledDate_idx" ON "AssignedWorkout"("programAssignmentId", "scheduledDate");

-- CreateIndex
CREATE INDEX "AssignedWorkoutExercise_assignedWorkoutId_order_idx" ON "AssignedWorkoutExercise"("assignedWorkoutId", "order");

-- CreateIndex
CREATE INDEX "Program_workspaceId_deletedAt_idx" ON "Program"("workspaceId", "deletedAt");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_sourceProgramId_fkey" FOREIGN KEY ("sourceProgramId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedWorkout" ADD CONSTRAINT "AssignedWorkout_programAssignmentId_fkey" FOREIGN KEY ("programAssignmentId") REFERENCES "ProgramAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedWorkoutExercise" ADD CONSTRAINT "AssignedWorkoutExercise_assignedWorkoutId_fkey" FOREIGN KEY ("assignedWorkoutId") REFERENCES "AssignedWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedWorkoutExercise" ADD CONSTRAINT "AssignedWorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
