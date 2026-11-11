import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { loadPlanOverview } from "@/lib/plan/overview";
import { EQUIPMENT, EXPERIENCE, GOALS, resolvePrefs } from "@/lib/plan/generator";
import { CONDITIONS } from "@/lib/plan/goal";
import {
  coachAddExercise,
  coachAddWorkout,
  coachRemoveExercise,
  coachRemoveWorkout,
  coachSetLighterWeeks,
  coachSetPlanNote,
  coachSetTargets,
  coachSetWorkoutNote,
  coachSwapExercise,
} from "@/lib/actions/coach-plan";
import { PlanView, type PlanActions } from "@/components/athlete/PlanView";
import { AssignPanel } from "@/components/coach/AssignPanel";

export const metadata: Metadata = { title: "Plan" };

/**
 * The coach's view of a client's plan is the athlete's Plan view: the same
 * weeks, the same workouts, the same targets, the same editing controls —
 * plus assigning a draft.
 */
export default async function ClientPlanPage({ params }: { params: { id: string; assignmentId: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const client = await prisma.clientProfile.findFirst({
    where: { id: params.id, workspaceId, deletedAt: null },
    select: { id: true, fullName: true, programAssignments: { where: { status: "ACTIVE" }, select: { id: true } } },
  });
  if (!client) notFound();

  const plan = await loadPlanOverview({ clientId: client.id, workspaceId, assignmentId: params.assignmentId });
  if (!plan) notFound();

  // Each action is bound to this client and this plan on the server, so the
  // browser can only ever edit the plan it was shown.
  const actions: PlanActions = {
    addWorkout: coachAddWorkout.bind(null, client.id, plan.id),
    removeWorkout: coachRemoveWorkout.bind(null, client.id, plan.id),
    addExercise: coachAddExercise.bind(null, client.id, plan.id),
    removeExercise: coachRemoveExercise.bind(null, client.id, plan.id),
    swapExercise: coachSwapExercise.bind(null, client.id, plan.id),
    setTargets: coachSetTargets.bind(null, client.id, plan.id),
    setWorkoutNote: coachSetWorkoutNote.bind(null, client.id, plan.id),
    setPlanNote: coachSetPlanNote.bind(null, client.id, plan.id),
    setLighterWeeks: coachSetLighterWeeks.bind(null, client.id, plan.id),
  };

  const firstName = client.fullName.split(" ")[0];
  const draft = plan.status === "PAUSED";
  const live = plan.status === "ACTIVE";
  const prefs = plan.prefs ? resolvePrefs(plan.prefs) : null;
  const chips = prefs
    ? [
        GOALS[prefs.goal].label,
        `${prefs.daysPerWeek} day${prefs.daysPerWeek === 1 ? "" : "s"} a week`,
        `${prefs.minutes} min`,
        EQUIPMENT[prefs.equipment].label,
        EXPERIENCE[prefs.experience].label,
        ...prefs.conditions.map((c) => CONDITIONS[c].label),
      ]
    : [];
  const status = draft ? "Draft plan" : live ? `Live plan · what ${firstName} sees` : plan.status === "COMPLETED" ? "Past plan" : "Plan";

  return (
    <div>
      <Link href={`/clients/${client.id}`} className="press -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {client.fullName}
      </Link>

      <div className="rise mb-7 mt-3">
        <p className="eyebrow">
          {status} · {plan.totalWeeks} weeks
        </p>
        <h1 className="mt-1.5 text-[34px] leading-[1.08] text-ink sm:text-[42px]">{plan.name}</h1>
        {plan.goalText && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">“{plan.goalText}”</p>}
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-ink-soft">
                {c}
              </span>
            ))}
          </div>
        )}
        {!plan.generated && (
          <p className="mt-3 max-w-2xl text-[13px] text-ink-mute">Built from a library program, exactly as written. It edits the same way; lighter weeks are off unless you turn them on below.</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <PlanView
          plan={plan}
          actions={actions}
          workoutBase={live ? `/clients/${client.id}/log?workoutId=` : undefined}
          startLabel="Log this workout"
          noteLabel={`Plan notes · ${firstName} sees these`}
        />

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {draft && <AssignPanel clientId={client.id} clientName={client.fullName} assignmentId={plan.id} startDate={plan.startDate} hasLivePlan={client.programAssignments.length > 0} />}
          {plan.rationale.length > 0 && (
            <div>
              <p className="eyebrow">Why this plan</p>
              <ul className="rule mt-3 divide-y divide-line">
                {plan.rationale.map((r, i) => (
                  <li key={i} className="flex gap-3 py-3 text-[14px] leading-relaxed text-ink-soft">
                    <span className="mt-0.5 font-mono text-xs text-ink-mute">{String(i + 1).padStart(2, "0")}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
