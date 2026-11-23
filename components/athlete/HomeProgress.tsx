import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Athlete, ProgressData } from "@/lib/athlete/data";
import type { HistoryCalendar as Calendar } from "@/lib/history/calendar";
import type { sessionSummary } from "@/lib/actions/athlete";
import { ProgressView } from "@/components/athlete/ProgressView";
import { HistoryCalendar } from "@/components/athlete/HistoryCalendar";

/**
 * Home's top section: the same Strength section and heatmap Progress opens with (the lift done most, its curve,
 * the year of training), without the records. Nothing logged yet renders nothing, so the workout card leads.
 */
export function HomeProgressView({
  athlete,
  data,
  calendar,
  summary,
  base = "",
}: {
  athlete: Pick<Athlete, "metric">;
  data: ProgressData;
  calendar: Calendar;
  summary?: typeof sessionSummary;
  base?: string;
}) {
  if (data.totals.sessions === 0 && calendar.kind === "empty") return null;
  return (
    <div className="rise space-y-2">
      <ProgressView data={data} goalMetric={athlete.metric} records={false} compact history={<HistoryCalendar calendar={calendar} summary={summary} compact />} />
      <Link href={`${base}/progress`} className="press inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-ink-soft hover:text-ink">
        All progress <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
