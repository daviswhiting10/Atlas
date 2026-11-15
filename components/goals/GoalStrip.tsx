import type { CSSProperties } from "react";
import type { ChapterCell } from "@/lib/goals/chapter";
import type { StripCell } from "@/lib/goals/today";
import { StripField, TodayDot } from "./StripClient";

type Cell = StripCell | ChapterCell;

const LABEL: Record<Cell, string> = { met: "Done", partial: "Some done", excused: "Excused", rest: "Nothing done", paused: "Paused", carried: "Before Atlas", open: "Open", future: "Still to come" };

/**
 * A field of dots, one per day. Today glows; days before Atlas are grey; a
 * small tick sits above a day where an attempt restarted. Styles: app/dusk.css.
 * Must sit inside `.dusk`.
 */
export function GoalStrip({ id, cells, columns = 15, todayIndex, restarts = [] }: { id: string; cells: Cell[]; columns?: number; todayIndex?: number; restarts?: number[] }) {
  const done = cells.filter((c) => c === "met" || c === "carried").length;
  return (
    <StripField id={id} role="img" aria-label={`${done} days done of ${cells.length}`} className="dusk-dots" style={{ "--dusk-dots-columns": 15, "--dusk-dots-columns-wide": columns } as CSSProperties}>
      {cells.map((c, i) => {
        const title = `Day ${i + 1} \u00b7 ${i === todayIndex ? "Today" : LABEL[c]}${restarts.includes(i) ? " \u00b7 started again here" : ""}`;
        // Today's dot follows the card's live state, so ticking the last rule fills it at once.
        if (i === todayIndex) return <TodayDot key={i} index={i} state={c} title={title} restart={restarts.includes(i)} />;
        return <span key={i} className="dusk-dot" style={{ "--i": i } as CSSProperties} data-state={c} data-restart={restarts.includes(i) ? "" : undefined} title={title} />;
      })}
    </StripField>
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
