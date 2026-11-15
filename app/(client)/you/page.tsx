import type { Metadata } from "next";
import { getAthlete, getPlanOverview } from "@/lib/athlete/data";
import { YouScreen } from "@/components/athlete/YouScreen";
import { libraryForPicker } from "@/lib/programs/library";
import { prisma } from "@/lib/db/client";

export const metadata: Metadata = { title: "You" };

export default async function YouPage({ searchParams }: { searchParams: { goals?: string } }) {
  const athlete = await getAthlete();
  // These don't depend on each other. A coach also needs their program library and whether a plan is running;
  // the screen no longer shows totals, so it no longer reads the whole set history either.
  const [account, plan, programs] = await Promise.all([
    // Real accounts (not guests or the demo) can set or change a password here.
    athlete.isGuest ? null : prisma.user.findUnique({ where: { id: athlete.userId }, select: { email: true, passwordHash: true } }),
    athlete.isCoach ? getPlanOverview() : null,
    athlete.isCoach ? libraryForPicker(athlete.workspaceId) : [],
  ]);
  return <YouScreen athlete={athlete} account={account} hasPlan={plan != null} programs={programs} goalsOpen={searchParams.goals === "1"} />;
}
