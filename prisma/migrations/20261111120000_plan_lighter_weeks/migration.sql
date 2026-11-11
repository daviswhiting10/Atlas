-- A per-plan switch for lighter weeks. NULL keeps each plan's current
-- behaviour: on for generated plans, off for hand-built ones.
ALTER TABLE "ProgramAssignment" ADD COLUMN "lighterWeeks" BOOLEAN;
