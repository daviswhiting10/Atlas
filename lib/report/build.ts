/**
 * The numbers on a progress report: one four-week block, compared within itself (week 1's best set
 * against the block's best). Only improved lifts appear, and none ever shows a loss.
 *
 * Built on what exists: finished sessions and their days come from lib/history (`datedFinished`,
 * `isLoggedSet`), each session's top set from `sessionPoint` in lib/plan/overload, PRs from
 * `prsOverTime`. New here: the week-1-vs-best comparison and the line that only rises. Pure, no I/O.
 */

import { datedFinished, isLoggedSet } from "@/lib/history/days";
import { prsOverTime } from "@/lib/history/records";
import type { HistorySession } from "@/lib/history/types";
import { sessionPoint } from "@/lib/plan/overload";
import { BLOCK_WEEKS } from "@/lib/plan/generator";
import { blockRange, weekInBlock } from "./blocks";

export const MAX_CHARTS = 8;

type Best = { weight: number; reps: number };
export type ChartKind = "weight" | "reps" | "assist";

export type ReportChart = {
  exerciseId: string;
  name: string;
  kind: ChartKind;
  /** The title's gain: "+30 lb", "+2 reps", "20 lb less assistance". */
  gain: string;
  /** The line under it: "185 to 215". */
  from: string;
  /** Gain relative to where the block started: the ranking. */
  relative: number;
  /** One value per week, never falling (null before the lift was first logged). Assisted lifts are flipped so they rise too. */
  series: (number | null)[];
};

export type Report = {
  start: string;
  end: string;
  sessions: number;
  planned: number;
  /** Lifts with sessions in at least two weeks. */
  eligible: number;
  /** Lifts that improved (all of them, not just the charts shown). */
  improved: number;
  /** The third stat: volume up, else PRs set, else none. Never a loss. */
  third: { kind: "volume"; value: number } | { kind: "prs"; value: number } | null;
  /** At most MAX_CHARTS, biggest relative gain first. Empty when nothing improved. */
  charts: ReportChart[];
  /** Nothing improved: show consistency only. */
  consistencyOnly: boolean;
};

/** Assisted lifts are recognised by name: there is no field for it. */
export const isAssisted = (name: string): boolean => /assist/i.test(name);

const num = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());

/** a is a better week than b for this lift: heavier (less assistance), then more reps. */
function better(a: Best, b: Best, assisted: boolean): boolean {
  if (a.weight !== b.weight) return assisted ? a.weight < b.weight : a.weight > b.weight;
  return a.reps > b.reps;
}

/** A session's best set for an assisted lift: the least assistance, then the most reps at it. */
function assistedBest(sets: HistorySession["sets"]): Best | null {
  const done = sets.filter(isLoggedSet);
  if (done.length === 0) return null;
  const weight = Math.min(...done.map((s) => s.weight ?? 0));
  return { weight, reps: Math.max(...done.filter((s) => (s.weight ?? 0) === weight).map((s) => s.reps as number)) };
}

export function buildReport({
  startDay,
  block,
  sessions,
  names,
  planned,
  lighterLastWeek,
  timeZone,
}: {
  startDay: string;
  block: number;
  sessions: HistorySession[];
  /** exerciseId -> name. */
  names: Record<string, string>;
  /** Workouts scheduled in the block (skipped ones excluded). */
  planned: number;
  /** The block's last week is a lighter week: it never counts toward the volume comparison. */
  lighterLastWeek: boolean;
  timeZone: string;
}): Report {
  const { start, end } = blockRange(startDay, block);
  const inBlock = datedFinished(sessions, timeZone)
    .map((d) => ({ ...d, week: weekInBlock(startDay, block, d.day) }))
    .filter((d): d is typeof d & { week: number } => d.week != null);

  // Each lift's best set per week, and each week's total volume.
  const lifts = new Map<string, { assisted: boolean; weeks: Map<number, Best> }>();
  const weekVolume = new Map<number, number>();
  for (const { session, day, week } of inBlock) {
    const byLift = new Map<string, HistorySession["sets"]>();
    for (const s of session.sets) if (s.exerciseId) byLift.set(s.exerciseId, [...(byLift.get(s.exerciseId) ?? []), s]);
    for (const [exerciseId, sets] of Array.from(byLift)) {
      const assisted = isAssisted(names[exerciseId] ?? "");
      const point = sessionPoint(day, sets);
      if (!point) continue;
      const best: Best | null = assisted ? assistedBest(sets) : { weight: point.weight ?? 0, reps: point.reps };
      if (!best) continue;
      weekVolume.set(week, (weekVolume.get(week) ?? 0) + (assisted ? sets.filter(isLoggedSet).reduce((a, s) => a + (s.reps as number), 0) : point.volume));
      const lift = lifts.get(exerciseId) ?? { assisted, weeks: new Map() };
      lifts.set(exerciseId, lift);
      const cur = lift.weeks.get(week);
      if (!cur || better(best, cur, assisted)) lift.weeks.set(week, best);
    }
  }

  let eligible = 0;
  const improved: ReportChart[] = [];
  for (const [exerciseId, { assisted, weeks }] of Array.from(lifts)) {
    const seen = Array.from(weeks.keys()).sort((a, b) => a - b);
    if (seen.length < 2) continue; // under two weeks of data: nothing to compare
    eligible++;
    const first = weeks.get(seen[0]) as Best;
    // Heavier (or less assistance) at the same or more reps, else more reps at the same weight.
    const later = seen.slice(1).map((w) => ({ w, b: weeks.get(w) as Best }));
    const heavier = later.filter(({ b }) => (assisted ? b.weight < first.weight : b.weight > first.weight) && b.reps >= first.reps);
    const moreReps = later.filter(({ b }) => b.weight === first.weight && b.reps > first.reps);
    let kind: ChartKind;
    let top: Best;
    if (heavier.length > 0) {
      kind = assisted ? "assist" : "weight";
      top = heavier.map((x) => x.b).reduce((a, b) => (better(b, a, assisted) ? b : a));
    } else if (moreReps.length > 0) {
      kind = "reps";
      top = moreReps.map((x) => x.b).reduce((a, b) => (b.reps > a.reps ? b : a));
    } else continue;

    const name = names[exerciseId] ?? "Exercise";
    const dw = Math.abs(top.weight - first.weight);
    const dr = top.reps - first.reps;
    const at = first.weight > 0 ? ` at ${num(first.weight)} lb` : "";
    const gain = kind === "weight" ? `+${num(dw)} lb` : kind === "assist" ? `${num(dw)} lb less assistance` : `+${dr} rep${dr === 1 ? "" : "s"}`;
    const from = kind === "weight" ? `${num(first.weight)} to ${num(top.weight)}` : kind === "assist" ? `${num(first.weight)} to ${num(top.weight)} lb assist` : `${first.reps} to ${top.reps} reps${at}`;
    const relative = kind === "reps" ? dr / Math.max(first.reps, 1) : dw / Math.max(first.weight, 1);

    // The line is the best so far: a lighter week can't pull it down, so an improved lift always rises.
    let run = kind === "reps" ? first.reps : first.weight;
    const series: (number | null)[] = [];
    for (let w = 1; w <= BLOCK_WEEKS; w++) {
      const b = weeks.get(w);
      if (w < seen[0]) series.push(null);
      else {
        if (b) {
          if (kind === "reps" && b.weight === first.weight) run = Math.max(run, b.reps);
          if (kind === "weight" && b.weight > first.weight && b.reps >= first.reps) run = Math.max(run, b.weight);
          if (kind === "assist" && b.weight < first.weight && b.reps >= first.reps) run = Math.min(run, b.weight);
        }
        series.push(run);
      }
    }
    improved.push({ exerciseId, name, kind, gain, from, relative, series: kind === "assist" ? series.map((v) => (v == null ? null : first.weight - v)) : series });
  }
  improved.sort((a, b) => b.relative - a.relative || a.name.localeCompare(b.name));

  // Volume: the best working week against week 1. A lighter week is expected to dip, so it never counts.
  const w1 = weekVolume.get(1) ?? 0;
  const working = Array.from(weekVolume.keys()).filter((w) => w > 1 && !(lighterLastWeek && w === BLOCK_WEEKS));
  const best = Math.max(0, ...working.map((w) => weekVolume.get(w) as number));
  const volume = w1 > 0 ? Math.round(((best - w1) / w1) * 100) : 0;
  const prs = Object.values(prsOverTime(inBlock.map((d) => d.session), { metric: "e1rm", timeZone })).reduce((n, e) => n + e.records.length, 0);

  return {
    start,
    end,
    sessions: planned > 0 ? Math.min(inBlock.length, planned) : inBlock.length,
    planned,
    eligible,
    improved: improved.length,
    third: volume > 0 ? { kind: "volume", value: volume } : prs > 0 ? { kind: "prs", value: prs } : null,
    charts: improved.slice(0, MAX_CHARTS),
    consistencyOnly: improved.length === 0,
  };
}
