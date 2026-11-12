import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { loadClientProgress } from "@/lib/coach/progress";
import { ProgressView, RecordsList } from "@/components/athlete/ProgressView";
import { ClientDetail } from "./ClientDetail";

/** One record per exercise: the most recent, which is the heaviest (a record only lands when it's beaten). */
function bestPerExercise<T extends { exercise: string }>(prs: T[]): T[] {
  const seen = new Set<string>();
  return prs.filter((r) => (seen.has(r.exercise) ? false : (seen.add(r.exercise), true)));
}

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!workspaceId) redirect("/login");

  const progress = await loadClientProgress(params.id, workspaceId);
  if (!progress) notFound();
  const { client, data, metric } = progress;

  return (
    <ClientDetail
      progress={
        <>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="eyebrow">Progress</p>
            <Link href={`/clients/${client.id}/progress`} className="press inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
              Body &amp; milestones <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ProgressView data={data} goalMetric={metric} totals={false} records={false} emptyAction={{ href: `/clients/${client.id}/log`, label: `Log a workout for ${client.firstName}` }} />
        </>
      }
      records={<RecordsList prs={bestPerExercise(data.recentPRs)} />}
    />
  );
}
