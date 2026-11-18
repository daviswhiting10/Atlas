import type { Metadata } from "next";
import { getAthlete, getPlanOverview } from "@/lib/athlete/data";
import { YouScreen } from "@/components/athlete/YouScreen";
import { libraryForPicker } from "@/lib/programs/library";
import { prisma } from "@/lib/db/client";
import { activeGoalId } from "@/lib/goals/data";

export const metadata: Metadata = { title: "You" };

export default async function YouPage({ searchParams }: { searchParams: { goals?: string } }) {
  const athlete = await getAthlete();
  // These don't depend on each other. A coach also needs their program library and whether a plan is running;
  // the screen no longer shows totals, so it no longer reads the whole set history either.
  const [account, plan, programs, goalId] = await Promise.all([
    // Real accounts (not guests or the demo) can set or change a password here.
    athlete.isGuest ? null : prisma.user.findUnique({ where: { id: athlete.userId }, select: { email: true, passwordHash: true } }),
    athlete.isCoach ? getPlanOverview() : null,
    athlete.isCoach ? libraryForPicker(athlete.workspaceId) : [],
    // Starting a goal lives here (Today shows the goal's card once one is running).
    athlete.isGuest ? null : activeGoalId(athlete.clientId),
  ]);
  return <YouScreen athlete={athlete} account={account} hasPlan={plan != null} programs={programs} goalsOpen={searchParams.goals === "1"} canStartGoal={!athlete.isGuest && !goalId} />;
}
