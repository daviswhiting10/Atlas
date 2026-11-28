import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Athlete } from "@/lib/athlete/data";
import { SaveAccountPanel } from "@/components/athlete/account";
import { YouTabs } from "@/components/nutrition/YouTabs";
import { youLine, type YouPlan } from "@/lib/athlete/you-summary";

/**
 * The You screen, from plain data: who you are, your plan (one link to the Plan tab), and your goals and challenges, on one
 * screen. Signing out and the password are in the header's ⋯ menu; making a new plan (which is how goals change) is on the Plan tab.
 */
export function YouScreen({
  athlete,
  nutrition = false,
  challenges,
  plan = null,
  base = "",
}: {
  athlete: Pick<Athlete, "name" | "isDemo" | "isGuest">;
  /** The NUTRITION flag is on: a Profile | Nutrition switch at the top. */
  nutrition?: boolean;
  /** Goals & challenges: starting one, the running one, the finished ones (streamed in). */
  challenges?: React.ReactNode;
  /** The plan in one card: its name, the goal in their words, and how far along they are. */
  plan?: YouPlan | null;
  /** "/demo" in the demo. */
  base?: string;
}) {
  return (
    <div className="rise">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-signal/15 text-[22px] font-semibold text-signal">{athlete.name.charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <h1 className="truncate text-3xl leading-none text-ink sm:text-4xl">{athlete.name}</h1>
          {youLine(plan) && <p className="mt-1.5 text-[14px] text-ink-mute">{youLine(plan)}</p>}
        </div>
      </div>

      {plan && (
        <Link href={`${base}/plan`} aria-label={`Your plan: ${plan.name}`} className="press mt-6 flex items-center justify-between gap-3 rounded-[22px] border border-line bg-paper p-4">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Your plan</span>
            <span className="mt-1.5 block truncate text-[20px] font-semibold leading-tight text-ink">{plan.name}</span>
            {plan.goalText && <span className="mt-1 block text-[14px] leading-snug text-ink-soft">{plan.goalText}</span>}
            <span className="mt-3 block h-2 overflow-hidden rounded-full bg-ink/15" role="img" aria-label={`${plan.done} of ${plan.total} workouts done`}>
              <span className="block h-full rounded-full bg-signal" style={{ width: `${plan.total ? Math.min(100, Math.round((plan.done / plan.total) * 100)) : 0}%` }} />
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
        </Link>
      )}
      {nutrition && (
        <div className="mt-6">
          <YouTabs active="profile" />
        </div>
      )}

      {challenges}

      {/* A guest's own plan is worth keeping. */}
      {athlete.isGuest && !athlete.isDemo && <SaveAccountPanel className="mt-6" />}
    </div>
  );
}
