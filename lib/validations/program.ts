import { z } from "zod";

export const SetSchema = z
  .object({
    setNumber: z.number().int().positive(),
    weight: z.number().nullable().optional(),
    repMin: z.number().int().positive(),
    repMax: z.number().int().positive(),
    rpe: z.number().min(1).max(10).nullable().optional(),
    restSeconds: z.number().int().positive().nullable().optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.repMin <= d.repMax, {
    message: "repMin must be ≤ repMax",
    path: ["repMax"],
  });

export const WorkoutExerciseSchema = z.object({
  id: z.string().optional(),
  exerciseId: z.string().min(1),
  order: z.number().int().min(1),
  prescribedSets: z.array(SetSchema).min(1, "Add at least one set"),
  notes: z.string().nullable().optional(),
});

export const WorkoutSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Workout name required"),
  dayOfWeek: z.number().int().min(1).max(7),
  order: z.number().int().min(1),
  exercises: z.array(WorkoutExerciseSchema),
});

export const BlockSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Block name required"),
  order: z.number().int().min(1),
  weeks: z.number().int().min(1),
  workouts: z.array(WorkoutSchema),
});

export const ProgramBodySchema = z.object({
  name: z.string().min(1, "Program name required"),
  description: z.string().nullable().optional(),
  goalTags: z
    .object({
      goals: z.array(z.string()),
      conditions: z.array(z.string()),
    })
    .nullable()
    .optional(),
  blocks: z.array(BlockSchema),
});

export const AssignProgramSchema = z.object({
  clientId: z.string().min(1),
  startDate: z.string().min(1), // ISO date string
  name: z.string().optional(),
});

// For PATCH on assigned workout — partial update
export const UpdateAssignedWorkoutSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  loggedBy: z.enum(["TRAINER", "CLIENT"]).optional(),
  status: z.enum(["PLANNED", "LOGGED", "SKIPPED", "RESCHEDULED"]).optional(),
  scheduledDate: z.string().optional(),
  exercises: z
    .array(
      z.object({
        id: z.string().optional(),
        exerciseId: z.string().min(1),
        order: z.number().int().min(1),
        prescribedSets: z.array(SetSchema).min(1),
        notes: z.string().nullable().optional(),
      })
    )
    .optional(),
});

export type ProgramBody = z.infer<typeof ProgramBodySchema>;
export type AssignProgramInput = z.infer<typeof AssignProgramSchema>;
export type UpdateAssignedWorkoutInput = z.infer<typeof UpdateAssignedWorkoutSchema>;
