import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { allGoals } from "@/lib/goals/data";

/**
 * You → Goals & challenges: one list. Starting one comes first (while none is running), then the running one, then the finished
 * ones; tap a row to open it (edit, end, delete). Nothing at all when there is nothing to start and nothing to show.
 */
export async function GoalsAndChallenges({ clientId, canStart }: { clientId: string; canStart: boolean }) {
  const goals = await allGoals(clientId);
  if (goals.length === 0 && !canStart) return null;
  return (
    <section className="mt-7" aria-label="Goals and challenges">
      <h2 className="mb-1 flex min-h-11 items-center text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Goals &amp; challenges</h2>
      <ul className="divide-y divide-line border-y border-line">
        {canStart && (
          <li>
            <Link href="/goals/new" className="press flex min-h-[56px] items-center justify-between gap-3 py-2 text-[17px] font-semibold text-signal hover:opacity-80">
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4 shrink-0" /> Start a goal
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
            </Link>
          </li>
        )}
        {goals.map((g) => (
          <li key={g.id}>
            <Link href={`/challenges/${g.id}`} className="press flex min-h-[56px] items-center justify-between gap-3 py-2 hover:text-ink-soft">
              <span className="min-w-0">
                <span className="block truncate text-[17px] font-semibold text-ink">{g.name}</span>
                <span className="block text-[13px] text-ink-mute">
                  {g.status === "ACTIVE" ? `Running · since ${format(parseISO(g.startDay), "MMM d")}` : `${format(parseISO(g.startDay), "MMM d")}${g.endedAt ? ` – ${format(g.endedAt, "MMM d, yyyy")}` : ""}`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
