/**
 * Progress, cut down for the browser. The screen shows one overall line first and one lift's chart only once a lift is
 * picked, yet every lift's whole history was sent with the page (about 70 KB for 14 lifts, and the browser computed the overall
 * line from it). Now the server computes the overall line, the browser gets each lift's name and session count, and a
 * lift's history is fetched when it is picked (lib/actions/athlete exerciseSeries). Pure: no I/O.
 */
import type { ExerciseProgress, ProgressData } from "@/lib/athlete/data";
import { overallProgress, type Overall } from "./overall";

export function liteProgress(data: ProgressData): { data: ProgressData; overall: Overall } {
  const overall = overallProgress(data.exercises);
  const exercises: ExerciseProgress[] = data.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, muscles: [], loaded: e.loaded, timed: e.timed, series: [], count: e.series.length, target: null }));
  return { data: { ...data, exercises }, overall };
}
