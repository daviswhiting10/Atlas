import Link from "next/link";
import { HowItWorks } from "@/components/HowItWorks";
import { ArrowRight } from "lucide-react";
import type { Athlete } from "@/lib/athlete/data";
import { isCoached } from "@/lib/athlete/coached";
import { GoalsPanel } from "@/components/athlete/GoalsPanel";
import { PasswordPanel, SaveAccountPanel } from "@/components/athlete/account";
import { OwnProgramPicker, type LibraryProgram } from "@/components/athlete/OwnProgramPicker";
import { YouTabs } from "@/components/nutrition/YouTabs";

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
}) {
  return (
    <div className="rise">
      <h1 className="truncate text-3xl leading-none text-ink sm:text-4xl">{athlete.name}</h1>
      {nutrition && (
        <div className="mt-6">
          <YouTabs active="profile" />
        </div>
      )}

      {/* How it works and Start a goal describe the self-serve flow: a coached client's plan comes from her coach. */}
      {!isCoached(athlete) && <HowItWorks className="mt-8" />}

      {canStartGoal && (
        <Link href="/goals/new" className="press flex min-h-[56px] items-center justify-between gap-3 border-y border-line text-[17px] font-semibold text-ink hover:text-ink-soft">
          Start a goal <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
        </Link>
      )}

      {/* A demo account is sample data; a guest's own plan is worth keeping. */}
      {athlete.isDemo && (
        <Link href="/agents#demo" className="press mt-6 flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper p-4 hover:border-ink/20">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">Watch an AI assistant use this data</span>
            <span className="block text-[13px] text-ink-mute">How Claude reads Alex&apos;s plan, spots stalls and logs a workout, safely.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
        </Link>
      )}
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
