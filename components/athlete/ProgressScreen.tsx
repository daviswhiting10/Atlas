import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { Athlete, ProgressData } from "@/lib/athlete/data";
import { ProgressView } from "@/components/athlete/ProgressView";
import { exerciseSeries, sessionSummary } from "@/lib/actions/athlete";
import { liteProgress } from "@/lib/progress/lite";
import { EmptyStart } from "@/components/athlete/EmptyStart";
import { HistoryCalendar } from "@/components/athlete/HistoryCalendar";
import type { HistoryCalendar as Calendar } from "@/lib/history/calendar";
import { historyView } from "@/lib/history/view";

export type ChapterRow = { id: string; name: string; startDay: string; endedAt: Date | null; chapter: unknown };

/** The Progress screen, from plain data: the sections (Strength, History, Records), then finished goals (chapters). */
export function ProgressScreen({ athlete, data, calendar, chapters }: { athlete: Pick<Athlete, "metric" | "hasHistory">; data: ProgressData; calendar: Calendar; chapters: ChapterRow[] }) {
  // Never blank: with nothing finished yet there is the one line and the one action.
  if (!athlete.hasHistory && calendar.kind === "empty" && data.totals.sessions === 0 && chapters.length === 0) return <div className="pt-4"><EmptyStart /></div>;
  // The browser gets names and counts plus the overall line; a lift's own history is fetched when it is picked.
  const lite = liteProgress(data);
  return (
    <div className="pt-4">
      <ProgressView data={lite.data} overall={lite.overall} loadSeries={exerciseSeries} goalMetric={athlete.metric} history={<HistoryCalendar calendar={historyView(calendar)} summary={sessionSummary} quickLog />} />
      {chapters.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-3 flex min-h-11 items-center text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Chapters</h2>
          <ul className="divide-y divide-line border-t border-line">
            {chapters.map((c) => (
              <li key={c.id}>
                <Link href={`/goals/${c.id}`} className="press flex items-baseline justify-between gap-3 py-3.5 hover:text-ink-soft">
                  <span className="text-[17px] font-semibold text-ink">{c.name}</span>
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
