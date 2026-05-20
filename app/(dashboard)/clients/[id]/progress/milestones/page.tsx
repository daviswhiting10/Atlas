"use client";

import { useParams } from "next/navigation";
import { format } from "date-fns";
import {
  ProgressShell,
  useProgressData,
  type ProgressData,
  type MilestoneRecord,
} from "../_components/ProgressShell";
import { MilestoneCard } from "../_components/MilestoneCard";

function groupByMonth(milestones: MilestoneRecord[]): Map<string, MilestoneRecord[]> {
  const groups = new Map<string, MilestoneRecord[]>();
  for (const m of milestones) {
    const key = format(new Date(m.achievedAt), "MMMM yyyy");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  return groups;
}

function MilestonesView({ data }: { data: ProgressData }) {
  const { milestones } = data;

  if (milestones.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground text-sm">
        Milestones are earned automatically as you log sessions and hit new PRs.
        <br />
        Log your first session to get started.
      </div>
    );
  }

  const groups = groupByMonth(milestones);

  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([month, items]) => (
        <div key={month}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {month}
          </p>
          <div className="rounded-xl border bg-card px-4 divide-y-0">
            {items.map((m) => (
              <MilestoneCard key={m.id} milestone={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MilestonesPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const { data, loading } = useProgressData(clientId);

  return (
    <ProgressShell clientName="Progress" data={data} loading={loading}>
      {(d) => <MilestonesView data={d} />}
    </ProgressShell>
  );
}
