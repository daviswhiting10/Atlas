import Link from "next/link";
import type { TodayView } from "@/lib/goals/today";

/**
 * The running challenge on Home, as one small line under the greeting: "Day 2 of 75 · 75 Hard ●". The dot is filled once
 * every rule is done today. It opens the challenge (its checklist, ending it, deleting it).
 */
export function GoalChip({ view }: { view: Pick<TodayView, "goalId" | "name" | "dayOfGoal" | "length" | "rules"> }) {
  const allDone = view.rules.length > 0 && view.rules.every((r) => r.state === "met");
  return (
    <Link
      href={`/challenges/${view.goalId}`}
      className="press -ml-1 inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-line px-3.5 text-[14px] font-medium text-ink-soft hover:text-ink"
    >
      <span className="tnum min-w-0 truncate">
        Day {view.dayOfGoal} of {view.length} · {view.name}
      </span>
      <span
        role="img"
        aria-label={allDone ? "Done today" : "Not done today"}
        className={allDone ? "h-2.5 w-2.5 shrink-0 rounded-full bg-signal" : "h-2.5 w-2.5 shrink-0 rounded-full border-2 border-signal"}
      />
    </Link>
  );
}
