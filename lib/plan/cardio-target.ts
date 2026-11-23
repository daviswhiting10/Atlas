import { z } from "zod";

/**
 * The extra fields an exercise carries when it is added to a plan as cardio (distance and time, no weight). Chosen at that
 * moment: an exercise is cardio or strength for good, with no per-session switch.
 */
export const CardioTarget = z.object({
  mode: z.enum(["STRENGTH", "CARDIO"]).optional(),
  activity: z.enum(["RUN", "WALK", "OTHER"]).optional(),
  /** A target distance in metres, if the plan names one ("Long run, 4 mi"). */
  distanceM: z.number().finite().min(0).max(500_000).nullable().optional(),
  /** A target time in whole minutes, if the plan names one. */
  minutes: z.number().int().min(1).max(600).optional(),
});
