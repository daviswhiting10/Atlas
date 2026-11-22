/** The short "check it before saving" view of a plan read from a file (pure). */
import type { PlanContext } from "@/lib/programs/plan-context";
import { formatTime, timedRows, type SheetGrid, type TimedRow } from "@/lib/programs/sheet-plan";
import { shapeSheet } from "@/lib/programs/sheet-summary";

export type ImportPreview = {
  title: string;
  /** "4 weeks · 4 days a week · 21 exercises". */
  meta: string;
  /** Each day and how many exercises. */
  lines: string[];
  /** One lift through the weeks, so the athlete can see each week was read as written: "Week 3: 4 × 6–8 at 155". */
  weekly: { exercise: string; weeks: string[] } | null;
  /** More than one week, every one the same: said plainly, so a flattened read can't pass for a real one. */
  sameEveryWeek: boolean;
  /** Every exercise done for time, shown in minutes; `unclear` ones ask for the unit. */
  times: TimedRow[];
};

const reps = (min: number, max: number, unit: string) =>
  unit === "secs" ? (min === max ? formatTime(min) : `${formatTime(min)}–${formatTime(max)}`) : min === max ? `${min}` : `${min}–${max}`;

export function previewFromGrid(grid: SheetGrid, context: PlanContext): ImportPreview {
  const { weeks } = shapeSheet(grid, context);
  const first = weeks[0];
  const days = first?.days ?? [];
  const exercises = new Set(weeks.flatMap((w) => w.days.flatMap((d) => d.entries.map((e) => e.exercise.toLowerCase())))).size;
  const rx = (w: (typeof weeks)[number]) => JSON.stringify(w.days.map((d) => d.entries.map((e) => [e.exercise, e.rx.sets, e.rx.repMin, e.rx.repMax, e.load?.weight ?? null])));
  // The first lift whose numbers change from week to week, else simply the first lift.
  const lifts = days.flatMap((d, di) => d.entries.map((e, ei) => ({ name: e.exercise, at: (w: (typeof weeks)[number]) => w.days[di]?.entries[ei] })));
  const changing = lifts.find((l) => new Set(weeks.map((w) => JSON.stringify(l.at(w) && [l.at(w)!.rx.sets, l.at(w)!.rx.repMin, l.at(w)!.rx.repMax, l.at(w)!.load?.weight]))).size > 1) ?? lifts[0];
  return {
    title: grid.programName || "My plan",
    meta: [`${weeks.length} week${weeks.length === 1 ? "" : "s"}`, `${days.length} day${days.length === 1 ? "" : "s"} a week`, `${exercises} exercise${exercises === 1 ? "" : "s"}`].join(" · "),
    lines: days.map((d) => `${d.name}: ${d.entries.length} exercise${d.entries.length === 1 ? "" : "s"}`),
    weekly:
      weeks.length > 1 && changing
        ? {
            exercise: changing.name,
            weeks: weeks.map((w) => {
              const e = changing.at(w);
              return `Week ${w.week}: ${e ? `${e.rx.sets} × ${reps(e.rx.repMin, e.rx.repMax, e.rx.unit)}${e.load?.weight != null ? ` at ${e.load.weight}` : ""}` : "not in this week"}`;
            }),
          }
        : null,
    sameEveryWeek: weeks.length > 1 && new Set(weeks.map(rx)).size === 1,
    times: timedRows(grid),
  };
}
