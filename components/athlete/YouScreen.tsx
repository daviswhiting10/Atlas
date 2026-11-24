import Link from "next/link";
import { HowItWorks } from "@/components/HowItWorks";
import { ArrowRight } from "lucide-react";
import type { Athlete } from "@/lib/athlete/data";
import { isCoached } from "@/lib/athlete/coached";
import { GoalsPanel } from "@/components/athlete/GoalsPanel";
import { PasswordPanel, SaveAccountPanel } from "@/components/athlete/account";
import { OwnProgramPicker, type LibraryProgram } from "@/components/athlete/OwnProgramPicker";
import { YouTabs } from "@/components/nutrition/YouTabs";
import { youLine, type YouPlan } from "@/lib/athlete/you-summary";

/**
 * The You screen, from plain data. Just the person, their account, and the two things they
 * can do here: change their goals and sign out. Totals and plan settings live where they are used.
 */
export function YouScreen({
  athlete,
  account,
  hasPlan,
  programs,
  goalsOpen,
  canStartGoal,
  nutrition = false,
  challenges,
  plan = null,
}: {
  athlete: Pick<Athlete, "name" | "prefs" | "selfServe" | "isDemo" | "isGuest" | "isCoach">;
  account: { email: string | null; passwordHash: string | null } | null;
  hasPlan: boolean;
  /** A coach's own library programs (empty for everyone else). */
  programs: LibraryProgram[];
  goalsOpen: boolean;
  /** No goal is running: starting one (75 Hard) is here, not on Today. */
  canStartGoal: boolean;
  /** The NUTRITION flag is on: a Profile | Nutrition switch at the top. */
  nutrition?: boolean;
  /** The Challenges list (running and finished), streamed in. */
  challenges?: React.ReactNode;
  /** The plan in one card: its name, the goal in their words, and how far along they are. */
  plan?: YouPlan | null;
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
        <section aria-label="Your plan" className="mt-6 rounded-[22px] border border-line bg-paper p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Your plan</p>
          <p className="mt-1.5 text-[20px] font-semibold leading-tight text-ink">{plan.name}</p>
          {plan.goalText && <p className="mt-1 text-[14px] leading-snug text-ink-soft">{plan.goalText}</p>}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/15" role="img" aria-label={`${plan.done} of ${plan.total} workouts done`}>
            <div className="h-full rounded-full bg-signal" style={{ width: `${plan.total ? Math.min(100, Math.round((plan.done / plan.total) * 100)) : 0}%` }} />
          </div>
        </section>
      )}
      {nutrition && (
        <div className="mt-6">
          <YouTabs active="profile" />
        </div>
      )}

      {/* How it works and Start a goal describe the self-serve flow: a coached client's plan comes from her coach. */}
      {!isCoached(athlete) && <HowItWorks className="mt-8" aiDemo={athlete.isDemo} />}

      {canStartGoal && (
        <Link href="/goals/new" className="press flex min-h-[56px] items-center justify-between gap-3 border-y border-line text-[17px] font-semibold text-ink hover:text-ink-soft">
          Start a goal <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
        </Link>
      )}

      {challenges}

      {/* A guest's own plan is worth keeping. (The demo's link to the AI walkthrough is in the last step of How it works.) */}
      {athlete.isGuest && !athlete.isDemo && <SaveAccountPanel className="mt-6" />}
      {account && !athlete.isCoach && <PasswordPanel className="mt-6" email={account.email ?? ""} hasPassword={account.passwordHash != null} />}

      <div className="mt-6">
        <GoalsPanel
          prefs={athlete.prefs}
          canRebuild={athlete.selfServe}
          isGuest={athlete.isGuest}
          initiallyOpen={goalsOpen}
          extra={
            athlete.isCoach ? (
              <div>
                <p className="text-[17px] font-semibold text-ink">My programs</p>
                <p className="mt-1 text-[14px] text-ink-soft">Train on a program from your library, exactly as written.</p>
                <OwnProgramPicker programs={programs} hasPlan={hasPlan} className="mt-4" />
              </div>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
