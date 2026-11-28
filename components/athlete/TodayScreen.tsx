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
import { WeekNoteCard } from "@/components/plan/WeekNoteCard";
import { noteForWeek } from "@/lib/plan/week-notes";

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
  nutrition,
  log,
  base = "",
}: {
  athlete: Pick<Athlete, "firstName" | "isDemo" | "isGuest" | "isCoach" | "selfServe" | "prefs">;
  plan: PlanOverview | null;
  /** The running goal's card (nothing when there isn't one). */
  goal: ReactNode;
  /** The latest progress report, for a week after a block ends (nothing otherwise). */
  report?: ReactNode;
  /** The Nutrition row (only passed while the NUTRITION flag is on). */
  nutrition?: ReactNode;
  /** The + Log pill (a sheet of what can be logged). Not shown in the demo. */
  log?: ReactNode;
  /** Prefix for this screen's links ("/demo" keeps the demo inside /demo). */
  base?: string;
}) {
  const next = plan?.nextUp ?? null;
  const empty = todayEmptyState({ hasPlan: !!plan, selfServe: athlete.selfServe, isCoach: athlete.isCoach, isGuest: athlete.isGuest });
  const lighterWeek = plan != null && plan.lighterWeeks && next != null && next.week % BLOCK_WEEKS === 0;
  // This week, at a glance: the plan's workouts for the week, done or not. Shown once one is done (never a row of zeros).
  const week = plan ? plan.workouts.filter((w) => w.week === plan.currentWeek && w.status !== "SKIPPED") : [];
  const done = week.filter((w) => w.status === "LOGGED").length;
  // The note pinned to this week of the plan, if the coach wrote one.
  const weekNote = plan ? noteForWeek(plan.weekNotes, plan.currentWeek) : null;

  return (
    <div className="space-y-14 pt-4">
      {/* Today is the day: the name and Log, the running challenge, one line of where the plan stands, then the workout. */}
      <header className="rise -mb-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-[34px] font-semibold leading-none tracking-[-0.035em] text-ink">{athlete.firstName}</h1>
          {log}
        </div>
        {/* The running challenge: one line, left-aligned (it streams in; nothing when there is none). */}
        {goal && <div className="mt-3 empty:hidden">{goal}</div>}
        {plan && next && (
          <p className="tnum mt-2 text-[14px] text-ink-mute" data-testid="plan-line">
            Week {plan.currentWeek} of {plan.totalWeeks}
            {week.length > 0 ? ` · ${done}/${week.length} this week` : ""}
          </p>
        )}
      </header>

      {!plan && athlete.selfServe && <PendingPlan />}

      {athlete.isGuest && !athlete.isDemo && (
        <Link href={`${base}/you`} className="press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-signal/30 bg-signal/5 px-3 text-[13px] font-medium text-signal">
          Save your account <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {plan && next && (
        <section className="rise">
          <p className={label}>
            Week {next.week}
            {lighterWeek ? " · Lighter week" : ""}
          </p>
          <h2 className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.04em] text-ink [overflow-wrap:anywhere]">{next.name}</h2>
          <p className="mt-3 text-[15px] text-ink-mute">
            {next.exercises.length} exercises · {next.estMinutes} min
          </p>
          <Link href={`${base}/workouts/${next.id}`} prefetch className="press mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90 sm:max-w-sm">
            Start
          </Link>
          <Link href={`${base}/workouts/new`} className="press mt-1 flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-ink-soft hover:text-ink sm:max-w-sm">
            Log another workout
          </Link>
          {weekNote && <WeekNoteCard note={weekNote} className="mt-4 sm:max-w-sm" />}
        </section>
      )}

      {plan && !next && (
        <section className="rise">
          <p className={label}>Plan</p>
          <h2 className="mt-3 text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">Complete.</h2>
          {athlete.selfServe && (
            <Link href={`${base}/plan/new`} className="press mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text sm:max-w-sm">
              Build the next one
            </Link>
          )}
          <Link href={`${base}/workouts/new`} className="press mt-1 flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-ink-soft hover:text-ink sm:max-w-sm">
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
          <Link href={`${base}/workouts/new`} className="press flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90 sm:max-w-sm">
            Log a workout
          </Link>
          <Link href={`${base}/plan/new`} className="press mt-1 flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-ink-soft hover:text-ink sm:max-w-sm">
            Choose a plan
          </Link>
        </section>
      )}

      {nutrition}

    </div>
  );
}
