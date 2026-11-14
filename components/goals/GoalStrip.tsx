import { cn } from "@/lib/utils";
import type { ChapterCell } from "@/lib/goals/chapter";
import type { StripCell } from "@/lib/goals/today";

type Cell = StripCell | ChapterCell;

const STYLE: Record<Cell, string> = {
  met: "bg-signal",
  partial: "bg-signal/45",
  excused: "bg-signal/45",
  rest: "border border-ink/25",
  paused: "border border-dashed border-ink/25",
  carried: "bg-ink/20",
  open: "border-2 border-ink",
  future: "bg-ink/[0.06]",
};
const LABEL: Record<Cell, string> = { met: "Done", partial: "Some done", excused: "Excused", rest: "Nothing done", paused: "Paused", carried: "Before Atlas", open: "Open", future: "Still to come" };

/** One dot per day, 15 across. */
export function GoalStrip({ cells, dark = false, columns = 15 }: { cells: Cell[]; dark?: boolean; columns?: number }) {
  return (
    <div role="img" aria-label={`${cells.filter((c) => c === "met").length} days done of ${cells.length}`} className={cn("grid gap-1.5", "grid-cols-[repeat(15,minmax(0,1fr))]", columns > 15 && "sm:grid-cols-[repeat(25,minmax(0,1fr))]")}>
      {cells.map((c, i) => (
        <span key={i} title={`Day ${i + 1} · ${LABEL[c]}`} className={cn("aspect-square rounded-full", STYLE[c], dark && c === "met" && "bg-white", dark && c === "carried" && "bg-white/30", dark && (c === "rest" || c === "open") && "border-white/45", dark && c === "future" && "bg-white/10", dark && c === "partial" && "bg-white/55")} />
      ))}
    </div>
  );
}

export function StripLegend({ cells, dark = false }: { cells: Cell[]; dark?: boolean }) {
  const used = (["met", "partial", "excused", "carried", "rest", "open"] as Cell[]).filter((k) => cells.includes(k));
  return (
    <ul className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]", dark ? "text-white/55" : "text-ink-mute")}>
      {used.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-full", STYLE[k], dark && k === "met" && "bg-white", dark && k === "carried" && "bg-white/30", dark && (k === "rest" || k === "open") && "border-white/45", dark && k === "partial" && "bg-white/55")} />
          {LABEL[k]}
        </li>
      ))}
    </ul>
  );
}
