import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { Athlete, ProgressData } from "@/lib/athlete/data";
import { ProgressView } from "@/components/athlete/ProgressView";

export type ChapterRow = { id: string; name: string; startDay: string; endedAt: Date | null; chapter: unknown };

/** The Progress screen, from plain data: the totals and charts, then finished goals (chapters). */
export function ProgressScreen({ athlete, data, chapters }: { athlete: Pick<Athlete, "metric">; data: ProgressData; chapters: ChapterRow[] }) {
  return (
    <div>
      <h1 className="rise mb-8 text-4xl leading-none text-ink">Progress</h1>
      <ProgressView data={data} goalMetric={athlete.metric} />
      {chapters.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl text-ink">Chapters</h2>
          <ul className="mt-2 divide-y divide-line">
            {chapters.map((c) => (
              <li key={c.id}>
                <Link href={`/goals/${c.id}`} className="press flex items-baseline justify-between gap-3 py-3 hover:text-ink-soft">
                  <span className="text-[15px] font-semibold text-ink">{c.name}</span>
                  <span className="text-[13px] text-ink-mute">
                    {format(parseISO(c.startDay), "MMM d")}
                    {c.endedAt ? ` – ${format(c.endedAt, "MMM d, yyyy")}` : ""}
                    {c.chapter ? "" : " · draft"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
