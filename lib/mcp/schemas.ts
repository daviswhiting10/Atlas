/**
 * Shared input pieces for MCP tools.
 *
 * Two validation styles, on purpose:
 *  - Identifiers, dates and enums are STRICT. A malformed id is rejected.
 *  - Training values an AI client proposes (weight, reps, RPE) are COERCED
 *    to a safe value rather than rejecting the whole call, the same rule
 *    SetSchema in lib/validations/program.ts follows.
 */

import { z } from "zod";

export { ProgramBodySchema, SetSchema } from "@/lib/validations/program";

export const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Not a valid id");

export const ClientIdArg = Id.optional().describe(
  "The client to act on. Required when calling as a coach. Athletes may omit it — it always resolves to their own profile."
);

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, YYYY-MM-DD");

export const TimeZoneArg = z
  .string()
  .max(64)
  .optional()
  .describe("IANA timezone used to place sessions on a calendar day, e.g. America/New_York. Defaults to UTC.");

export const MOVEMENT_PATTERNS = [
  "SQUAT",
  "HINGE",
  "HORIZONTAL_PUSH",
  "VERTICAL_PUSH",
  "HORIZONTAL_PULL",
  "VERTICAL_PULL",
  "LUNGE",
  "CARRY",
  "ROTATION",
  "ANTI_ROTATION",
  "LOCOMOTION",
] as const;

/** One logged set as proposed by an AI client: ids strict, training values coerced. */
export const LoggedSetInput = z.object({
  exerciseId: Id,
  setNumber: z.number().int().min(1).max(20),
  weight: z.number().min(0).max(2000).nullable().optional().catch(null).describe("Pounds. null or omitted for bodyweight."),
  reps: z.number().int().min(0).max(1000).nullable().catch(null).describe("Reps, or seconds for a timed hold."),
  rpe: z.number().min(1).max(10).nullable().optional().catch(null),
});
