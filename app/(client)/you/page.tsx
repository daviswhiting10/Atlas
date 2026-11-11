import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAthlete, getPlanOverview, getProgress } from "@/lib/athlete/data";
import { EQUIPMENT, EXPERIENCE, GOALS } from "@/lib/plan/generator";
import { GoalsPanel } from "@/components/athlete/GoalsPanel";
import { StatRow } from "@/components/athlete/StatRow";
import { PasswordPanel, SaveAccountPanel } from "@/components/athlete/account";
import { OwnProgramPicker } from "@/components/athlete/OwnProgramPicker";
import { libraryForPicker } from "@/lib/programs/library";
import { prisma } from "@/lib/db/client";

export const metadata: Metadata = { title: "You" };

export default async function YouPage({ searchParams }: { searchParams: { goals?: string } }) {
  const [athlete, plan, progress] = await Promise.all([getAthlete(), getPlanOverview(), getProgress()]);
  const { prefs } = athlete;
  // Real accounts (not guests or the demo) can set or change a password here.
  const account = athlete.isGuest
    ? null
    : await prisma.user.findUnique({ where: { id: athlete.userId }, select: { email: true, passwordHash: true } });
  const kind = athlete.isDemo ? "Demo account · sample training" : athlete.isGuest ? "Guest account" : athlete.isCoach ? "My training" : "Athlete";

  return (
    <div className="rise">
      <header className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-2xl font-semibold text-white">
          {athlete.firstName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-4xl leading-none text-ink">{athlete.name}</h1>
          <p className="mt-2 text-sm text-ink-mute">{kind}</p>
        </div>
      </header>

      {/* A demo account is sample data; a guest's own plan is worth keeping. */}
      {athlete.isDemo && (
        <Link href="/agents#demo" className="press mt-6 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 hover:border-ink/20">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">Watch an AI assistant use this data</span>
            <span className="block text-[13px] text-ink-mute">How Claude reads Alex&apos;s plan, spots stalls and logs a workout, safely.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
        </Link>
      )}
      {athlete.isGuest && !athlete.isDemo && <SaveAccountPanel className="mt-8" />}
      {athlete.isCoach && (
        <section className="mt-8 rounded-2xl border border-line bg-white p-5">
          <p className="text-[17px] font-semibold text-ink">My programs</p>
          <p className="mt-1 text-[14px] text-ink-soft">Train on a program from your library, exactly as written.</p>
          <OwnProgramPicker programs={await libraryForPicker(athlete.workspaceId)} hasPlan={plan != null} className="mt-4" />
        </section>
      )}
      {account && !athlete.isCoach && <PasswordPanel className="mt-8" email={account.email} hasPassword={account.passwordHash != null} />}

      {/* The generator's settings describe a generated plan, not a program someone wrote. */}
      {athlete.selfServe && (plan?.generated ?? true) && (
        <StatRow
          className="mt-8"
          size="sm"
          stats={[
            { label: "Goal", value: GOALS[prefs.goal].label },
            { label: "Experience", value: EXPERIENCE[prefs.experience].label },
            { label: "Schedule", value: `${prefs.daysPerWeek} days · ${prefs.minutes} min` },
            { label: "Equipment", value: EQUIPMENT[prefs.equipment].label },
          ]}
        />
      )}

      <StatRow
        className={athlete.selfServe && (plan?.generated ?? true) ? "border-t-0" : "mt-8"}
        stats={[
          { label: "Workouts", value: String(progress.totals.sessions) },
          { label: "Sets", value: progress.totals.sets.toLocaleString() },
          { label: "Records", value: String(progress.totals.prs) },
          plan ? { label: "Week", value: String(plan.currentWeek), unit: `of ${plan.totalWeeks}` } : { label: "Week", value: "–" },
        ]}
      />

      <div className="mt-8">
        <GoalsPanel prefs={prefs} canRebuild={athlete.selfServe} isGuest={athlete.isGuest} initiallyOpen={searchParams.goals === "1"} />
      </div>
    </div>
  );
}
