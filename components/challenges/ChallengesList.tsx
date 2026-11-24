import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { allGoals } from "@/lib/goals/data";

/** You → Challenges: the running one first, then the finished ones. Tap a row to open it (edit, end, delete). Nothing when there are none. */
export async function ChallengesList({ clientId }: { clientId: string }) {
  const goals = await allGoals(clientId);
  if (goals.length === 0) return null;
  return (
    <section className="mt-8" aria-label="Challenges">
      <h2 className="mb-1 flex min-h-11 items-center text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Challenges</h2>
      <ul className="divide-y divide-line border-y border-line">
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
