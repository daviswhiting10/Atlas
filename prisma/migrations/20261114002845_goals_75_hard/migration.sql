-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ENDED');

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateKey" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "timeZone" TEXT NOT NULL,
    "startDay" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedBy" "LoggedBy" NOT NULL,
    "endedAt" TIMESTAMP(3),
    "chapter" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalCheckIn" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "workoutLogId" TEXT,
    "value" DOUBLE PRECISION,
    "excuse" BOOLEAN NOT NULL DEFAULT false,
    "by" "LoggedBy" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_clientId_status_idx" ON "Goal"("clientId", "status");

-- CreateIndex
CREATE INDEX "GoalCheckIn_goalId_day_idx" ON "GoalCheckIn"("goalId", "day");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalCheckIn" ADD CONSTRAINT "GoalCheckIn_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Added by hand (Prisma can't express partial indexes; a plain unique would let NULLs repeat).
-- One daily tick per rule per day:
CREATE UNIQUE INDEX "GoalCheckIn_tick_once" ON "GoalCheckIn"("goalId", "ruleKey", "day") WHERE "workoutLogId" IS NULL;
-- One tag per session per rule:
CREATE UNIQUE INDEX "GoalCheckIn_tag_once" ON "GoalCheckIn"("goalId", "ruleKey", "workoutLogId") WHERE "workoutLogId" IS NOT NULL;

-- Days are plain "yyyy-mm-dd" strings, never timestamps.
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_startDay_format" CHECK ("startDay" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "GoalCheckIn" ADD CONSTRAINT "GoalCheckIn_day_format" CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$');
