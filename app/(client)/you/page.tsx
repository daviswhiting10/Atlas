import type { Metadata } from "next";
import { getAthlete, getPlanOverview, getProgress } from "@/lib/athlete/data";
import { EQUIPMENT, EXPERIENCE, GOALS } from "@/lib/plan/generator";
import { PlanWizard } from "@/components/athlete/PlanWizard";
import { SignOutButton } from "@/components/athlete/SignOutButton";

export const metadata: Metadata = { title: "You" };

export default async function YouPage() {
  const [athlete, plan, progress] = await Promise.all([getAthlete(), getPlanOverview(), getProgress()]);
  const { prefs } = athlete;

  const facts = [
    ["Goal", GOALS[prefs.goal].label],
    ["Experience", EXPERIENCE[prefs.experience].label],
    ["Schedule", `${prefs.daysPerWeek} days · ${prefs.minutes} min`],
    ["Equipment", EQUIPMENT[prefs.equipment].label],
  ];

  return (
    <div className="space-y-10">
      <section className="rise grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink font-display text-3xl text-white">{athlete.firstName.charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="eyebrow">{athlete.isDemo ? "Demo athlete" : athlete.isGuest ? "Guest account" : "Athlete"}</p>
              <h1 className="truncate font-display text-[38px] leading-[1.05] text-ink sm:text-5xl">{athlete.name}</h1>
            </div>
          </div>

          {athlete.selfServe && (
            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {facts.map(([label, value]) => (
                <div key={label} className="surface p-4">
                  <dt className="eyebrow">{label}</dt>
                  <dd className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="space-y-3">
          <div className="surface p-5">
            <p className="eyebrow">So far</p>
            <p className="tnum mt-2 text-[15px] leading-relaxed text-ink-soft">
              <strong className="font-semibold text-ink">{progress.totals.sessions}</strong> workouts,{" "}
              <strong className="font-semibold text-ink">{progress.totals.sets.toLocaleString()}</strong> sets and{" "}
              <strong className="font-semibold text-ink">{progress.totals.prs}</strong> personal records logged
              {plan ? `. You're in week ${plan.currentWeek} of ${plan.totalWeeks}.` : "."}
            </p>
          </div>
          {athlete.isDemo && (
            <p className="rounded-2xl bg-gold/10 px-4 py-3 text-sm leading-relaxed text-ink-soft">
              This account was created with nine weeks of sample training so the charts have something to show. Anything you log is added on top.
            </p>
          )}
          <SignOutButton isGuest={athlete.isGuest} />
        </div>
      </section>

      {athlete.selfServe && (
        <section className="rise rise-2 border-t border-line pt-8">
          <p className="eyebrow">Change your goals</p>
          <p className="mb-6 mt-1.5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Different goal, new schedule, or training somewhere else? Adjust anything below and Atlas rebuilds the plan around it.
          </p>
          <PlanWizard mode="rebuild" initial={prefs} />
        </section>
      )}
    </div>
  );
}
