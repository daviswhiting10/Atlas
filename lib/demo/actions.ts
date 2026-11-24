/**
 * Stand-ins for the logger's saves on /demo: same shapes as lib/actions/athlete, kept in lib/demo/store (memory, this
 * tab). Nothing is written anywhere and nothing is read from the server. Changing the plan isn't part of the demo.
 */
import type { LoggerActions } from "@/components/athlete/WorkoutLogger";
import { demoStore } from "./store";

const NOT_IN_DEMO = { ok: false as const, error: "Changing the plan isn't part of the demo." };

export const demoActions: LoggerActions = {
  async saveSet(raw) {
    demoStore.setSet(raw.assignedWorkoutId, raw.aweId, raw.setNumber, { weight: raw.weight ?? null, reps: raw.reps ?? null, done: raw.done });
    return { workoutLogId: `demo-log-${raw.assignedWorkoutId}`, setLogId: raw.setLogId ?? `demo-set-${raw.aweId}-${raw.setNumber}` };
  },
  async finishWorkout(raw) {
    demoStore.finish(raw.assignedWorkoutId);
  },
  async planAddExercise() {
    return NOT_IN_DEMO;
  },
  async planRemoveExercise() {
    return NOT_IN_DEMO;
  },
  async planSetTargets() {
    return NOT_IN_DEMO;
  },
  async planSwapExercise() {
    return NOT_IN_DEMO;
  },
  async saveNote() {
    // The demo keeps nothing: the note is accepted for this screen only.
    return { ok: true as const };
  },
} as LoggerActions;
