import { prisma } from "./client";
import type { ProgramBody, UpdateAssignedWorkoutInput } from "@/lib/validations/program";

// ─── Program library ──────────────────────────────────────────────────────────

export async function getPrograms(workspaceId: string) {
  return prisma.program.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { assignments: true, blocks: true } },
      blocks: { select: { _count: { select: { workouts: true } } } },
    },
  });
}

export async function getProgram(id: string, workspaceId: string) {
  return prisma.program.findFirst({
    where: { id, workspaceId, deletedAt: null },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        include: {
          workouts: {
            orderBy: { order: "asc" },
            include: {
              exercises: {
                orderBy: { order: "asc" },
                include: { exercise: { select: { id: true, name: true, movementPattern: true, equipment: true } } },
              },
            },
          },
        },
      },
    },
  });
}

export async function upsertProgram(
  workspaceId: string,
  data: ProgramBody,
  existingId?: string
) {
  const durationWeeks = data.blocks.reduce((sum, b) => sum + b.weeks, 0);

  return prisma.$transaction(async (tx) => {
    // 1. Upsert program header
    const program = existingId
      ? await tx.program.update({
          where: { id: existingId },
          data: {
            name: data.name,
            description: data.description ?? null,
            goalTags: data.goalTags ?? undefined,
            durationWeeks,
            updatedAt: new Date(),
          },
        })
      : await tx.program.create({
          data: {
            workspaceId,
            name: data.name,
            description: data.description ?? null,
            goalTags: data.goalTags ?? undefined,
            durationWeeks,
            isTemplate: true,
          },
        });

    // 2. Reconcile blocks: delete blocks not in incoming data
    const incomingBlockIds = data.blocks.filter((b) => b.id).map((b) => b.id!);
    if (existingId) {
      await tx.block.deleteMany({
        where: { programId: program.id, id: { notIn: incomingBlockIds } },
      });
    }

    // 3. Upsert each block
    for (const block of data.blocks) {
      const savedBlock = block.id
        ? await tx.block.update({
            where: { id: block.id },
            data: { name: block.name, order: block.order, weeks: block.weeks },
          })
        : await tx.block.create({
            data: {
              workspaceId,
              programId: program.id,
              name: block.name,
              order: block.order,
              weeks: block.weeks,
            },
          });

      // 4. Reconcile workouts within this block
      const incomingWorkoutIds = block.workouts.filter((w) => w.id).map((w) => w.id!);
      if (block.id) {
        await tx.workout.deleteMany({
          where: { blockId: savedBlock.id, id: { notIn: incomingWorkoutIds } },
        });
      }

      for (const workout of block.workouts) {
        const savedWorkout = workout.id
          ? await tx.workout.update({
              where: { id: workout.id },
              data: {
                name: workout.name,
                dayOfWeek: workout.dayOfWeek,
                order: workout.order,
              },
            })
          : await tx.workout.create({
              data: {
                workspaceId,
                blockId: savedBlock.id,
                name: workout.name,
                dayOfWeek: workout.dayOfWeek,
                order: workout.order,
                isTemplate: true,
              },
            });

        // 5. Reconcile exercises within this workout
        const incomingExIds = workout.exercises.filter((e) => e.id).map((e) => e.id!);
        if (workout.id) {
          await tx.workoutExercise.deleteMany({
            where: { workoutId: savedWorkout.id, id: { notIn: incomingExIds } },
          });
        }

        for (const ex of workout.exercises) {
          if (ex.id) {
            await tx.workoutExercise.update({
              where: { id: ex.id },
              data: {
                exerciseId: ex.exerciseId,
                order: ex.order,
                prescribedSets: ex.prescribedSets,
                notes: ex.notes ?? null,
                section: ex.section ?? null,
              },
            });
          } else {
            await tx.workoutExercise.create({
              data: {
                workspaceId,
                workoutId: savedWorkout.id,
                exerciseId: ex.exerciseId,
                order: ex.order,
                prescribedSets: ex.prescribedSets,
                notes: ex.notes ?? null,
                section: ex.section ?? null,
              },
            });
          }
        }
      }
    }

    return program;
  });
}

export async function duplicateProgram(id: string, workspaceId: string) {
  const source = await prisma.program.findFirst({
    where: { id, workspaceId, deletedAt: null },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        include: {
          workouts: {
            orderBy: { order: "asc" },
            include: { exercises: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!source) return null;

  return prisma.$transaction(async (tx) => {
    const copy = await tx.program.create({
      data: {
        workspaceId,
        name: `${source.name} (Copy)`,
        description: source.description,
        goalTags: source.goalTags ?? undefined,
        durationWeeks: source.durationWeeks,
        isTemplate: true,
        isDraft: source.isDraft,
      },
    });

    for (const block of source.blocks) {
      const newBlock = await tx.block.create({
        data: {
          workspaceId,
          programId: copy.id,
          name: block.name,
          order: block.order,
          weeks: block.weeks,
          phase: block.phase ?? undefined,
        },
      });

      for (const workout of block.workouts) {
        const newWorkout = await tx.workout.create({
          data: {
            workspaceId,
            blockId: newBlock.id,
            name: workout.name,
            dayOfWeek: workout.dayOfWeek,
            order: workout.order,
            isTemplate: true,
          },
        });

        for (const ex of workout.exercises) {
          await tx.workoutExercise.create({
            data: {
              workspaceId,
              workoutId: newWorkout.id,
              exerciseId: ex.exerciseId,
              order: ex.order,
              prescribedSets: ex.prescribedSets as never,
              notes: ex.notes,
              section: ex.section,
            },
          });
        }
      }
    }

    return copy;
  });
}

export async function softDeleteProgram(id: string, workspaceId: string) {
  return prisma.program.updateMany({
    where: { id, workspaceId },
    data: { deletedAt: new Date() },
  });
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function assignProgram(
  workspaceId: string,
  programId: string,
  clientId: string,
  startDate: Date,
  name?: string
) {
  const program = await prisma.program.findFirst({
    where: { id: programId, workspaceId, deletedAt: null },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        include: {
          workouts: {
            orderBy: { order: "asc" },
            include: { exercises: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!program) throw new Error("Program not found");

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.programAssignment.create({
      data: {
        workspaceId,
        clientId,
        sourceProgramId: programId,
        name: name ?? program.name,
        startDate,
        status: "ACTIVE",
      },
    });

    let blockStartOffset = 0;
    for (const block of program.blocks) {
      for (let week = 0; week < block.weeks; week++) {
        for (const workout of block.workouts) {
          const dayOffset = blockStartOffset + week * 7 + ((workout.dayOfWeek ?? 1) - 1);
          const scheduledDate = new Date(startDate);
          scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

          const assigned = await tx.assignedWorkout.create({
            data: {
              workspaceId,
              programAssignmentId: assignment.id,
              sourceWorkoutId: workout.id,
              name: workout.name,
              scheduledDate,
              loggedBy: "TRAINER",
              status: "PLANNED",
              order: workout.order ?? 1,
            },
          });

          for (const ex of workout.exercises) {
            await tx.assignedWorkoutExercise.create({
              data: {
                workspaceId,
                assignedWorkoutId: assigned.id,
                exerciseId: ex.exerciseId,
                order: ex.order,
                prescribedSets: ex.prescribedSets as never,
                notes: ex.notes ?? null,
              },
            });
          }
        }
      }
      blockStartOffset += block.weeks * 7;
    }

    return assignment;
  });
}

export async function getAssignment(id: string, workspaceId: string) {
  return prisma.programAssignment.findFirst({
    where: { id, workspaceId },
    include: {
      client: { select: { id: true, fullName: true } },
      sourceProgram: { select: { id: true, name: true } },
      assignedWorkouts: {
        orderBy: [{ scheduledDate: "asc" }, { order: "asc" }],
        include: {
          exercises: {
            orderBy: { order: "asc" },
            include: {
              exercise: {
                select: { id: true, name: true, movementPattern: true, equipment: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function getClientAssignments(clientId: string, workspaceId: string) {
  return prisma.programAssignment.findMany({
    where: { clientId, workspaceId },
    orderBy: { startDate: "desc" },
    include: {
      sourceProgram: { select: { id: true, name: true } },
      _count: { select: { assignedWorkouts: true } },
    },
  });
}

export async function updateAssignedWorkout(
  id: string,
  workspaceId: string,
  data: UpdateAssignedWorkoutInput
) {
  return prisma.$transaction(async (tx) => {
    // Verify ownership
    const existing = await tx.assignedWorkout.findFirst({
      where: { id, workspaceId },
      include: { exercises: true, workoutLog: { select: { id: true } } },
    });
    if (!existing) throw new Error("Not found");

    // Validate CLIENT mode: all sets must have repMin and repMax (already enforced by Zod,
    // but re-check here per spec requirement)
    const targetLoggedBy = data.loggedBy ?? existing.loggedBy;
    if (targetLoggedBy === "CLIENT" && data.exercises) {
      for (const ex of data.exercises) {
        for (const set of ex.prescribedSets) {
          if (set.repMin == null || set.repMax == null) {
            throw new Error("CLIENT mode requires repMin and repMax on every set");
          }
        }
      }
    }

    // Update workout header
    const newScheduledDate = data.scheduledDate != null ? new Date(data.scheduledDate) : null;
    await tx.assignedWorkout.update({
      where: { id },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.loggedBy != null && { loggedBy: data.loggedBy }),
        ...(data.status != null && { status: data.status }),
        ...(newScheduledDate != null && { scheduledDate: newScheduledDate }),
      },
    });

    // Sync WorkoutLog.date so "Last session" reflects the corrected date
    if (newScheduledDate != null && existing.workoutLog) {
      await tx.workoutLog.update({
        where: { id: existing.workoutLog.id },
        data: { date: newScheduledDate },
      });
    }

    // Reconcile exercises if provided
    if (data.exercises != null) {
      const incomingIds = data.exercises.filter((e) => e.id).map((e) => e.id!);
      await tx.assignedWorkoutExercise.deleteMany({
        where: { assignedWorkoutId: id, id: { notIn: incomingIds } },
      });

      for (const ex of data.exercises) {
        if (ex.id) {
          await tx.assignedWorkoutExercise.update({
            where: { id: ex.id },
            data: {
              exerciseId: ex.exerciseId,
              order: ex.order,
              prescribedSets: ex.prescribedSets,
              notes: ex.notes ?? null,
            },
          });
        } else {
          await tx.assignedWorkoutExercise.create({
            data: {
              workspaceId,
              assignedWorkoutId: id,
              exerciseId: ex.exerciseId,
              order: ex.order,
              prescribedSets: ex.prescribedSets,
              notes: ex.notes ?? null,
            },
          });
        }
      }
    }

    return tx.assignedWorkout.findFirst({
      where: { id },
      include: { exercises: { orderBy: { order: "asc" }, include: { exercise: { select: { id: true, name: true } } } } },
    });
  });
}
