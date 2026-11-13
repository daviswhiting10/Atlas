import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAthlete } from "@/lib/athlete/data";
import { loadQuickSession } from "@/lib/actions/quick-log";
import { QuickLog } from "@/components/sessions/QuickLog";

export const metadata: Metadata = { title: "Log a workout" };

/** An athlete logs a workout done outside their plan (or edits one). */
export default async function NewWorkoutPage({ searchParams }: { searchParams: { session?: string } }) {
  await getAthlete(); // signed-in athlete, or redirected
  const initial = searchParams.session ? await loadQuickSession({ sessionId: searchParams.session }) : null;
  if (searchParams.session && !initial) notFound();
  return <QuickLog heading={initial ? "Edit workout" : "Log a workout"} backHref="/today" backLabel="Today" doneHref="/today" initial={initial} />;
}
