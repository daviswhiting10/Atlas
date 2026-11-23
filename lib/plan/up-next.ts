/** The athlete Plan tab's first screen (option B), from the plan overview: up next first, then the rest of the week. Pure. */
import type { PlanOverview, WorkoutSummary } from "./overview";
import { BLOCK_WEEKS } from "./generator";

export type WeekRow = { id: string; name: string; dot: string; meta: string; done: boolean };

export type UpNextView = {
  /** "Week 3 of 12 · Build". */
  eyebrow: string;
  next: { id: string; name: string; meta: string; lighter: boolean; lines: Array<{ name: string; rx: string }>; more: number } | null;
  /** "This week · 1 of 4 done". */
  weekLabel: string;
  /** This week's other workouts, in order. */
  rows: WeekRow[];
};

const SHOWN = 3;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const meta = (w: WorkoutSummary) => `${plural(w.exercises.length, "exercise")} · ~${w.estMinutes} min`;
const rx = (e: WorkoutSummary["exercises"][number]) => `${e.sets} × ${e.reps}${e.weight != null ? ` at ${e.weight}` : ""}`;

export function upNextView(plan: PlanOverview): UpNextView {
  const week = plan.currentWeek;
  const block = plan.blocks.length > 0 ? plan.blocks[Math.min(Math.floor((week - 1) / BLOCK_WEEKS), plan.blocks.length - 1)] : null;
  const inWeek = plan.workouts.filter((w) => w.week === week);
  const done = inWeek.filter((w) => w.status === "LOGGED").length;
  const n = plan.nextUp;
  return {
    eyebrow: [`Week ${week} of ${plan.totalWeeks}`, block?.name].filter(Boolean).join(" · "),
    next: n
      ? {
          id: n.id,
          name: n.name,
          meta: meta(n),
          lighter: n.deload,
          lines: n.exercises.slice(0, SHOWN).map((e) => ({ name: e.name, rx: rx(e) })),
          more: Math.max(0, n.exercises.length - SHOWN),
        }
      : null,
    weekLabel: `This week · ${done} of ${inWeek.length} done`,
    rows: inWeek
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.id !== n?.id)
      .map(({ w, i }) => ({
        id: w.id,
        name: w.name,
        dot: w.status === "LOGGED" ? "✓" : String(i + 1),
        meta: w.status === "LOGGED" ? `Done · ${day(w.date)}` : w.status === "SKIPPED" ? "Skipped" : meta(w),
        done: w.status === "LOGGED",
      })),
  };
}
