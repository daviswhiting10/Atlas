-- Add band color and per-set note to SetLog
ALTER TABLE "SetLog" ADD COLUMN "bandColor" TEXT;
ALTER TABLE "SetLog" ADD COLUMN "note" TEXT;
