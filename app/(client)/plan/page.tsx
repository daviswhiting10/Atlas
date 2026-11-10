import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { getAthlete, getPlanOverview } from "@/lib/athlete/data";
import { EQUIPMENT, EXPERIENCE, GOALS } from "@/lib/plan/generator";
import { PlanView } from "@/components/athlete/PlanView";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage() {
  const [athlete, plan] = await Promise.all([getAthlete(), getPlanOverview()]);

  if (!plan) {
    return (
      <div className="surface rise p-8 text-center">
        <h1 className="font-display text-4xl text-ink">No plan yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-soft">Answer four questions and Atlas lays out your next 12 weeks.</p>
        <Link href="/you?goals=1" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-ink px-6 text-[15px] font-semibold text-white hover:bg-ink/85">
          Build my plan <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const { prefs } = athlete;
  const chips = athlete.selfServe
    ? [GOALS[prefs.goal].label, `${prefs.daysPerWeek} days a week`, `${prefs.minutes} min`, EQUIPMENT[prefs.equipment].label, EXPERIENCE[prefs.experience].label]
    : [];

  return (
    <div>
      <div className="rise mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Your plan · {plan.totalWeeks} weeks</p>
          <h1 className="mt-1.5 font-display text-[38px] leading-[1.05] text-ink sm:text-5xl">{plan.name}</h1>
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-ink-soft">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {athlete.selfServe && (
          <Link href="/you?goals=1" className="press flex h-11 shrink-0 items-center gap-2 self-start rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-ink/20 sm:self-auto">
            <SlidersHorizontal className="h-4 w-4" /> Change goals
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <PlanView plan={plan} />

        {plan.rationale.length > 0 && (
          <aside className="surface rise rise-3 h-fit p-5 sm:p-6 lg:sticky lg:top-24">
            <p className="eyebrow">Why this plan</p>
            <ul className="mt-3 space-y-3">
              {plan.rationale.map((r, i) => (
                <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink-soft">
                  <span className="tnum mt-0.5 font-mono text-xs text-signal">0{i + 1}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
