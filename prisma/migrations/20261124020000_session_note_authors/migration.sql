-- Session notes by author: a SessionNote can belong to one session (workoutLogId), written by the coach or the athlete.
-- Additive: one enum, two columns (one nullable, one with a default), a foreign key and a unique index.

CREATE TYPE "NoteAuthor" AS ENUM ('COACH', 'ATHLETE');

ALTER TABLE "SessionNote" ADD COLUMN "workoutLogId" TEXT,
ADD COLUMN "authorRole" "NoteAuthor" NOT NULL DEFAULT 'COACH';

ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_workoutLogId_fkey" FOREIGN KEY ("workoutLogId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SessionNote_workoutLogId_authorRole_key" ON "SessionNote"("workoutLogId", "authorRole");

-- Copy each session's existing note (WorkoutLog.clientNotes) into a SessionNote on that session. clientNotes stays (read
-- as a fallback for one release, then dropped). Who wrote it: a plan session's note is the coach's (only coaches write
-- it there); a quick log (OFF_PLAN) is the athlete's when the athlete runs their own plan or the coach hasn't seen it yet,
-- otherwise the coach's. Re-running it adds nothing (a session that has the note already is skipped).
INSERT INTO "SessionNote" ("id", "clientId", "date", "rawInput", "structuredNote", "workoutLogId", "authorRole", "createdAt")
SELECT
  'sn_' || replace(gen_random_uuid()::text, '-', ''),
  l."clientId",
  l."date",
  trim(l."clientNotes"),
  '{}'::jsonb,
  l."id",
  CASE
    WHEN l."source" = 'OFF_PLAN' AND (c."goalTargets" -> 'athlete' IS NOT NULL OR l."trainerSeen" = false) THEN 'ATHLETE'::"NoteAuthor"
    ELSE 'COACH'::"NoteAuthor"
  END,
  l."createdAt"
FROM "WorkoutLog" l
JOIN "ClientProfile" c ON c."id" = l."clientId"
WHERE coalesce(trim(l."clientNotes"), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM "SessionNote" n WHERE n."workoutLogId" = l."id");
