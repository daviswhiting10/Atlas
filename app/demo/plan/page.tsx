import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DemoPlanHome } from "@/components/demo/DemoPlanHome";
import { PlanView, type PlanActions } from "@/components/athlete/PlanView";
import { DEMO_PLAN } from "@/lib/demo/sample";
import { demoNoEdit } from "@/lib/demo/plan-actions";

/** Read-only: each edit is the same server action, which changes nothing. */
const demoPlanActions = {
  addWorkout: demoNoEdit,
  removeWorkout: demoNoEdit,
  addExercise: demoNoEdit,
  removeExercise: demoNoEdit,
  swapExercise: demoNoEdit,
  setTargets: demoNoEdit,
  setWorkoutNote: demoNoEdit,
  setPlanNote: demoNoEdit,
};

export const metadata = { title: "Plan" };

/** The sample athlete's plan: the week notes (this week's, then the weeks to come), up next, and every week. */
export default function DemoPlan({ searchParams }: { searchParams?: { view?: string } }) {
  if (searchParams?.view === "all" || searchParams?.view === "edit") {
    return (
      <div>
        <Link href="/demo/plan" className="press -ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-medium text-ink-soft">
          <ArrowLeft className="h-4 w-4" /> Plan
        </Link>
        <h1 className="rise mb-6 text-[28px] leading-[1.1] text-ink">All {DEMO_PLAN.totalWeeks} weeks</h1>
        <div className="max-w-3xl">
          <PlanView plan={DEMO_PLAN} actions={demoPlanActions as PlanActions} workoutBase="/demo/workouts" locked />
        </div>
      </div>
    );
  }
  return <DemoPlanHome />;
}
