import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { Athlete } from "@/lib/athlete/data";
import type { PlanOverview } from "@/lib/plan/overview";
import { BLOCK_WEEKS } from "@/lib/plan/generator";
import { PendingPlan } from "@/components/athlete/PendingPlan";
import { EmptyStart } from "@/components/athlete/EmptyStart";
import { NoPlanCard } from "@/components/athlete/NoPlanCard";
import { todayEmptyState } from "@/lib/athlete/empty-state";
import { RefreshWhileEmpty } from "@/components/athlete/RefreshWhileEmpty";

const label = "text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute";

/**
 * The Today screen, from plain data (the page loads it; a preview can pass fakes).
 * One hero: the next session and Start. Under it, this week at a glance, and the
 * goal's card while a goal is running. Nothing competing.
 */
export function TodayScreen({
  athlete,
  plan,
  goal,
  report,
}: {
  athlete: Pick<Athlete, "firstName" | "isDemo" | "isGuest" | "isCoach" | "selfServe" | "prefs">;
  plan: PlanOverview | null;
  /** The running goal's card (nothing when there isn't one). */
  goal: ReactNode;
  /** The latest progress report, for a week after a block ends (nothing otherwise). */
  report?: ReactNode;
}) {
  const next = plan?.nextUp ?? null;
  const empty = todayEmptyState({ hasPlan: !!plan, selfServe: athlete.selfServe, isCoach: athlete.isCoach, isGuest: athlete.isGuest });
  const lighterWeek = plan != null && plan.lighterWeeks && next != null && next.week % BLOCK_WEEKS === 0;
  // This week, at a glance: the plan's workouts for the week, done or not. Shown once one is done (never a row of zeros).
  const week = plan ? plan.workouts.filter((w) => w.week === plan.currentWeek && w.status !== "SKIPPED") : [];
  const done = week.filter((w) => w.status === "LOGGED").length;

  return (
    <div className="space-y-14 pt-4">
      {!plan && athlete.selfServe && <PendingPlan />}

      {athlete.isGuest && !athlete.isDemo && (
        <Link href="/you" className="press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-signal/30 bg-signal/5 px-3 text-[13px] font-medium text-signal">
          Save your account <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {plan && next && (
        <section className="rise">
          <p className={label}>
            Week {next.week}
            {lighterWeek ? " · Lighter week" : ""}
          </p>
          <h1 className="mt-3 text-[52px] font-semibold leading-none tracking-[-0.04em] text-ink [overflow-wrap:anywhere]">{next.name}</h1>
          <p className="mt-3 text-[15px] text-ink-mute">
            {next.exercises.length} exercises · {next.estMinutes} min
          </p>
          <Link href={`/workouts/${next.id}`} prefetch className="press mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90 sm:max-w-sm">
            Start
          </Link>
          <Link href="/workouts/new" className="press mt-1 flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-ink-soft hover:text-ink sm:max-w-sm">
            Log another workout
          </Link>
        </section>
      )}

      {plan && !next && (
        <section className="rise">
          <p className={label}>Plan</p>
          <h1 className="mt-3 text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">Complete.</h1>
          {athlete.selfServe && (
            <Link href="/you?goals=1" className="press mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text sm:max-w-sm">
              Build the next one
            </Link>
          )}
          <Link href="/workouts/new" className="press mt-1 flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-ink-soft hover:text-ink sm:max-w-sm">
            Log a workout
          </Link>
        </section>
      )}

      {/* No plan: logging is the action. A coach's athlete is waiting on a plan, so it is one line and the one
          button. Someone who builds their own (a self-made account, or a coach on their own training) gets
          the way to a plan as secondary text. */}
      {report}

      {empty === "coached" && (
        <>
          <EmptyStart />
          {/* Her coach may assign the plan any moment: it should appear without a reload. */}
          <RefreshWhileEmpty />
        </>
      )}
      {empty === "card" && <NoPlanCard prefs={athlete.prefs} />}
      {/* A guest keeps the plain fallback: the doors (reading a file costs money) are for accounts. */}
      {empty === "guest" && (
        <section className="rise">
          <Link href="/workouts/new" className="press flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90 sm:max-w-sm">
            Log a workout
          </Link>
          <Link href="/you?goals=1" className="press mt-1 flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-ink-soft hover:text-ink sm:max-w-sm">
            Choose a plan
          </Link>
        </section>
      )}

      {done > 0 && (
        <section>
          <p className={label}>This week</p>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-[56px] font-semibold leading-none tracking-[-0.04em] text-ink">{done}</span>
            <span className="text-[15px] font-medium text-ink-mute">of {week.length}</span>
          </p>
          <div className="mt-5 flex gap-2" role="img" aria-label={`${done} of ${week.length} workouts done this week`}>
            {week.map((w) => (
              <span key={w.id} className={w.status === "LOGGED" ? "h-2.5 flex-1 rounded-full bg-signal" : "h-2.5 flex-1 rounded-full bg-ink/15"} />
            ))}
          </div>
        </section>
      )}

      {/* While a goal is running, its card sits under today's session: the session is the hero. */}
      {goal}
    </div>
  );
}
