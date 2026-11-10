import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLoggerData } from "@/lib/athlete/data";
import { WorkoutLogger } from "@/components/athlete/WorkoutLogger";

export const metadata: Metadata = { title: "Workout" };

export default async function WorkoutPage({ params }: { params: { assignedWorkoutId: string } }) {
  const data = await getLoggerData(params.assignedWorkoutId);
  if (!data || data.exercises.length === 0) notFound();
  // Keyed by workout so switching resets the logger's state cleanly.
  return <WorkoutLogger key={data.id} data={data} />;
}
