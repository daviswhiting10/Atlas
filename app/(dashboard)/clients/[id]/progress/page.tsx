import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { TZ_COOKIE, loadProgress, safeTimeZone } from "@/lib/athlete/data";
import { loadPlanOverview } from "@/lib/plan/overview";
import { GOALS, resolvePrefs } from "@/lib/plan/generator";
import { ProgressView } from "@/components/athlete/ProgressView";

export const metadata: Metadata = { title: "Progress" };

/** Map the coach's free-form primary goal onto the metric charts lead with. */
const metricForGoal = (goal: string | null) => (goal === "performance" || goal === "strength" ? "e1rm" : goal === "weight_loss" ? "reps" : "weight");

/**
 * A client's progress, as the coach sees it: the athlete's own Progress
 * screen, from the same read model, for this client.
 */
export default async function ClientProgressPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const client = await prisma.clientProfile.findFirst({ where: { id: params.id, workspaceId, deletedAt: null }, select: { id: true, fullName: true, primaryGoal: true } });
  if (!client) notFound();

  const plan = await loadPlanOverview({ clientId: client.id, workspaceId });
  const data = await loadProgress({
    clientId: client.id,
    workspaceId,
    plan,
    selfServe: false,
    timeZone: safeTimeZone(cookies().get(TZ_COOKIE)?.value),
  });

  const goal = plan?.prefs ? GOALS[resolvePrefs(plan.prefs).goal] : null;
  const metric = goal?.metric ?? metricForGoal(client.primaryGoal);
  const { sessions, prs, since } = data.totals;
  const firstName = client.fullName.split(" ")[0];

  return (
    <div>
      <Link href={`/clients/${client.id}`} className="press -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {client.fullName}
      </Link>
      <div className="rise mb-8 mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl leading-none text-ink">{firstName}&apos;s progress</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            {sessions === 0 || !since
              ? `Nothing logged yet. This is the same screen ${firstName} sees, and it fills in as sessions are logged.`
              : `${sessions} workout${sessions === 1 ? "" : "s"} and ${prs} record${prs === 1 ? "" : "s"} since ${format(parseISO(since), "MMM d")}. This is the same screen ${firstName} sees.`}
          </p>
        </div>
        <nav className="flex shrink-0 gap-1 text-sm">
          <Link href={`/clients/${client.id}/progress/body`} className="press rounded-lg px-3 py-2 font-medium text-ink-soft hover:bg-ink/5 hover:text-ink">
            Body
          </Link>
          <Link href={`/clients/${client.id}/progress/milestones`} className="press rounded-lg px-3 py-2 font-medium text-ink-soft hover:bg-ink/5 hover:text-ink">
            Milestones
          </Link>
        </nav>
      </div>
      <ProgressView data={data} goalMetric={metric} emptyAction={{ href: `/clients/${client.id}/log`, label: `Log a workout for ${firstName}` }} />
    </div>
  );
}
