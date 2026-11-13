-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "mergedIntoId" TEXT;

-- CreateTable
CREATE TABLE "ExerciseAlias" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "exerciseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseChange" (
    "id" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "intoId" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "moved" JSONB,
    "by" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "ExerciseChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseAlias_key_idx" ON "ExerciseAlias"("key");

-- CreateIndex
CREATE INDEX "ExerciseAlias_exerciseId_idx" ON "ExerciseAlias"("exerciseId");

-- CreateIndex
CREATE INDEX "ExerciseChange_batch_idx" ON "ExerciseChange"("batch");

-- CreateIndex
CREATE INDEX "ExerciseChange_exerciseId_idx" ON "ExerciseChange"("exerciseId");

-- CreateIndex
CREATE INDEX "Exercise_mergedIntoId_idx" ON "Exercise"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlias" ADD CONSTRAINT "ExerciseAlias_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
