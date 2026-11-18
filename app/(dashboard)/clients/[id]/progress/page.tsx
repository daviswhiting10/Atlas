import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { loadClientProgress } from "@/lib/coach/progress";
import { ProgressView } from "@/components/athlete/ProgressView";
import { prisma } from "@/lib/db/client";
import { MilestoneCard } from "./_components/MilestoneCard";

export const metadata: Metadata = { title: "Progress" };

/**
 * A client's progress, as the coach sees it: the athlete's own Progress
 * screen, from the same read model, for this client.
 */
export default async function ClientProgressPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  // Milestones sit under the charts (they had a page of their own); newest first.
  const [progress, milestones] = await Promise.all([
    loadClientProgress(params.id, workspaceId),
    prisma.milestone.findMany({
      where: { clientId: params.id, workspaceId },
      orderBy: { achievedAt: "desc" },
      take: 12,
      select: { id: true, type: true, title: true, description: true, metricValue: true, metricUnit: true, exerciseId: true, achievedAt: true, seenByClient: true, exercise: { select: { name: true } } },
    }),
  ]);
  if (!progress) notFound();
  const { client, data, metric } = progress;
  const { sessions, prs, since } = data.totals;
  const firstName = client.firstName;

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
      </div>
      <ProgressView data={data} goalMetric={metric} />
      {milestones.length > 0 && (
        <section className="mt-10">
          <p className="eyebrow mb-3">Milestones</p>
          <div className="rounded-xl border bg-card px-4">
            {milestones.map(({ exercise, achievedAt, ...m }) => (
              <MilestoneCard key={m.id} milestone={{ ...m, exerciseName: exercise?.name ?? null, achievedAt: achievedAt.toISOString() }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
