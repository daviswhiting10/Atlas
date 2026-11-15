import type { CSSProperties } from "react";
import type { ChapterCell } from "@/lib/goals/chapter";
import type { StripCell } from "@/lib/goals/today";

type Cell = StripCell | ChapterCell;

const LABEL: Record<Cell, string> = { met: "Done", partial: "Some done", excused: "Excused", rest: "Nothing done", paused: "Paused", carried: "Before Atlas", open: "Open", future: "Still to come" };

/**
 * A field of dots, one per day. Today glows; days before Atlas are grey; a
 * small tick sits above a day where an attempt restarted. Styles: app/dusk.css.
 * Must sit inside `.dusk`.
 */
export function GoalStrip({ cells, columns = 15, todayIndex, restarts = [] }: { cells: Cell[]; columns?: number; todayIndex?: number; restarts?: number[] }) {
  const done = cells.filter((c) => c === "met" || c === "carried").length;
  return (
    <div role="img" aria-label={`${done} days done of ${cells.length}`} className="dusk-dots" style={{ "--dusk-dots-columns": 15, "--dusk-dots-columns-wide": columns } as CSSProperties}>
      {cells.map((c, i) => (
        <span
          key={i}
          className="dusk-dot"
          data-state={c}
          data-today={i === todayIndex ? "" : undefined}
          data-restart={restarts.includes(i) ? "" : undefined}
          title={`Day ${i + 1} · ${i === todayIndex ? "Today" : LABEL[c]}${restarts.includes(i) ? " · started again here" : ""}`}
        />
      ))}
    </div>
  );
}

export function StripLegend({ cells, today = false, restarted = false }: { cells: Cell[]; today?: boolean; restarted?: boolean }) {
  const used = (["met", "partial", "excused", "carried", "rest", "open"] as Cell[]).filter((k) => cells.includes(k));
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-dusk-mute">
      {used.map((k) => (
        <li key={k} className="flex items-center gap-1">
          <span className="dusk-dot h-4 w-4" data-state={k} />
          {LABEL[k]}
        </li>
      ))}
      {today && (
        <li className="flex items-center gap-1">
          <span className="dusk-dot is-still h-4 w-4" data-state="open" data-today="" />
          Today
        </li>
      )}
      {restarted && (
        <li className="flex items-center gap-1">
          <span className="dusk-dot h-4 w-4" data-state="future" data-restart="" />
          Started again
        </li>
      )}
    </ul>
  );
}

/** A goal's name with its last word in italics: "75 Hard" becomes 75 <em>Hard</em>. */
export function AccentTitle({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  const last = words.pop();
  return (
    <>
      {words.join(" ")}
      {words.length > 0 && " "}
      <em>{last}</em>
    </>
  );
}
