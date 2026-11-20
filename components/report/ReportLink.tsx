import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReportEntry } from "@/lib/report/blocks";

const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** One row that opens a report: its label and the block's dates. No block number. */
export function ReportLink({ entry, className = "" }: { entry: ReportEntry; className?: string }) {
  return (
    <Link
      href={`/report/${entry.assignmentId}/${entry.block}`}
      className={`press flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 hover:border-ink/20 ${className}`}
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">Progress report</span>
        <span className="tnum block text-[13px] text-ink-mute">
          {fmt(entry.start)} – {fmt(entry.end)}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-mute" />
    </Link>
  );
}
