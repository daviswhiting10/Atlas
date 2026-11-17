import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { Athlete } from "@/lib/athlete/data";
import type { PlanOverview } from "@/lib/plan/overview";
import { BLOCK_WEEKS } from "@/lib/plan/generator";
import { Greeting } from "@/components/athlete/Greeting";
import { PendingPlan } from "@/components/athlete/PendingPlan";

/**
 * The Today screen, from plain data (the page loads it; a preview can pass fakes).
 * Deliberately short: a greeting, the goal card, and what to do next in the plan.
 * Progress, totals and the week's list live on their own screens.
 */
export function TodayScreen({
  athlete,
  plan,
  goal,
}: {
  athlete: Pick<Athlete, "firstName" | "isDemo" | "isGuest" | "isCoach" | "selfServe">;
  plan: PlanOverview | null;
  /** The goal card, or the quiet links when there isn't one. */
  goal: ReactNode;
}) {
  const next = plan?.nextUp ?? null;
  const block = plan && next ? plan.blocks[Math.min(Math.floor((plan.currentWeek - 1) / BLOCK_WEEKS), plan.blocks.length - 1)] : null;
  const lighterWeek = plan != null && plan.lighterWeeks && next != null && next.week % BLOCK_WEEKS === 0;

  return (
    <div className="space-y-6">
      {!plan && athlete.selfServe && <PendingPlan />}

      <div className="rise">
        <Greeting name={athlete.firstName} />
        {athlete.isDemo && (
          <Link href="/agents#demo" className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 max-md:min-h-11 text-[13px] font-medium text-ink-soft hover:border-ink/25 hover:text-ink">
            Demo account · watch an AI assistant use this data <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {athlete.isGuest && !athlete.isDemo && (
          <Link href="/you" className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/5 px-3 py-1.5 max-md:min-h-11 text-[13px] font-medium text-signal hover:bg-signal/10">
            Guest account · save it to keep your progress <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {goal}

      {/* Someone whose coach hasn't assigned anything yet needs to know why Today is quiet. */}
      {!plan && !athlete.selfServe && !athlete.isCoach && <p className="text-[14px] text-ink-mute">Your coach hasn&apos;t assigned a program yet. It will show up here as soon as they do.</p>}

      {plan && next && (
        <section className="surface-night rise rise-1 border border-line p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-mute">
            Up next · Week {next.week} of {plan.totalWeeks}
            {block ? ` · ${block.name}` : ""}
            {lighterWeek ? " · Deload week" : ""}
          </p>
          <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h2 className="text-4xl leading-none sm:text-5xl">{next.name}</h2>
              <p className="mt-3 line-clamp-2 text-[15px] text-ink-soft">
                {next.exercises
                  .slice(0, 3)
                  .map((e) => e.name)
                  .join(" · ")}
                {next.exercises.length > 3 ? ` + ${next.exercises.length - 3} more` : ""}
              </p>
              <p className="mt-1 text-[13px] text-ink-mute">
                {next.exercises.length} exercises · about {next.estMinutes} min
              </p>
            </div>
            <Link href={`/workouts/${next.id}`} className="press flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-dusk-button px-8 text-base font-semibold text-dusk-button-text hover:bg-dusk-button/90">
              Start workout <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      {plan && !next && (
        <section className="surface-night rise rise-1 border border-line p-8">
          <h2 className="text-4xl">Plan complete.</h2>
          {athlete.selfServe ? (
            <>
              <p className="mt-3 max-w-md text-ink-soft">Every week done. Rebuild your plan to start the next cycle — your history carries over.</p>
              <Link href="/you?goals=1" className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-dusk-button px-6 font-semibold text-dusk-button-text">
                Build the next one <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="mt-3 max-w-md text-ink-soft">Every workout in this program is done. Your coach will set up what comes next.</p>
          )}
        </section>
      )}
    </div>
  );
}
