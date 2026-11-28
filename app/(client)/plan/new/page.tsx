import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAthlete } from "@/lib/athlete/data";
import { loadPlanSummary } from "@/lib/plan/summary";
import { libraryForPicker } from "@/lib/programs/library";
import { PlanWizard } from "@/components/athlete/PlanWizard";
import { OwnProgramPicker } from "@/components/athlete/OwnProgramPicker";

export const metadata: Metadata = { title: "New plan" };

/**
 * New plan: the one place a plan is made (and so the one place goals are changed: changing your goals is making a new plan).
 * Say it in words, pick a goal, or bring your own plan; then experience, days a week, equipment. A coach who also trains also
 * gets their library's programs here. A coach's client has no such door: the plan comes from the coach.
 */
export default async function NewPlanPage() {
  const athlete = await getAthlete();
  if (!athlete.selfServe) redirect("/plan");
  const [plan, programs] = await Promise.all([
    loadPlanSummary({ clientId: athlete.clientId, workspaceId: athlete.workspaceId, fallbackPrefs: athlete.prefs }),
    athlete.isCoach ? libraryForPicker(athlete.workspaceId) : [],
  ]);
  return (
    <div className="rise">
      <Link href="/plan" className="press -ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-medium text-ink-soft">
        <ArrowLeft className="h-4 w-4" /> Plan
      </Link>
      <PlanWizard mode="rebuild" initial={athlete.prefs} first={plan == null} importer={!athlete.isGuest} after="/plan" />
      {athlete.isCoach && (
        <section className="rule mt-10 max-w-xl pt-8" aria-label="My programs">
          <p className="text-[17px] font-semibold text-ink">My programs</p>
          <p className="mt-1 text-[14px] text-ink-soft">Train on a program from your library, exactly as written.</p>
          <OwnProgramPicker programs={programs} hasPlan={plan != null} className="mt-4" />
        </section>
      )}
    </div>
  );
}
