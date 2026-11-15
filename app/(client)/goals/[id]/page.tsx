import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChapterView } from "@/components/goals/ChapterView";
import { getAthlete } from "@/lib/athlete/data";
import { loadGoal } from "@/lib/goals/data";

export const metadata: Metadata = { title: "Chapter" };

/**
 * A finished goal, as a chapter. A running goal has no page of its own: everything about it,
 * including its rules and ending it, is on the card on Today.
 */
export default async function GoalPage({ params }: { params: { id: string } }) {
  const athlete = await getAthlete();
  const loaded = await loadGoal(params.id, athlete.clientId);
  if (!loaded) notFound();
  const { goal } = loaded;
  if (goal.status === "ACTIVE" || !loaded.chapter) redirect("/today");

  return (
    <div className="dusk dusk-page">
      <div className="dusk-backdrop" aria-hidden />
      <Link href="/progress" className="dusk-chip is-quiet -ml-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> Progress
      </Link>
      <ChapterView goalId={goal.id} chapter={loaded.chapter} sealed={loaded.sealed} sealsAt={loaded.sealsAt} sessions={loaded.sessions} />
    </div>
  );
}
