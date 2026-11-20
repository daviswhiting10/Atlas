/**
 * Plan blocks: four weeks each, counted from the plan's start day. A block has ended once its last day
 * is past. Nothing here is stored: it is all worked out from the start day and today. Pure, no I/O.
 */

import { BLOCK_WEEKS } from "@/lib/plan/generator";

export const BLOCK_DAYS = BLOCK_WEEKS * 7;
/** A report card stays on Today this many days after its block ends. */
export const CARD_DAYS = 7;

const DAY_MS = 86_400_000;
const toTime = (day: string) => new Date(day + "T00:00:00Z").getTime();
const toDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Whole days from a to b (yyyy-mm-dd), negative if b is earlier. */
export const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY_MS);

/** First and last day (inclusive) of block `block` (1-based) of a plan that starts on `startDay`. */
export function blockRange(startDay: string, block: number): { start: string; end: string } {
  const start = toDay(toTime(startDay) + (block - 1) * BLOCK_DAYS * DAY_MS);
  return { start, end: toDay(toTime(start) + (BLOCK_DAYS - 1) * DAY_MS) };
}

/** 1-4: which week of the block a day falls in, or null if it is outside the block. */
export function weekInBlock(startDay: string, block: number, day: string): number | null {
  const d = daysBetween(blockRange(startDay, block).start, day);
  return d < 0 || d >= BLOCK_DAYS ? null : Math.floor(d / 7) + 1;
}

export const blockEnded = (startDay: string, block: number, today: string): boolean => today > blockRange(startDay, block).end;

/** Days since the block's last day (1 on the day after). */
export const daysSinceBlockEnd = (startDay: string, block: number, today: string): number => daysBetween(blockRange(startDay, block).end, today);

export type PlanForReports = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED";
  startDay: string;
  /** The last day a workout is scheduled on: how many blocks the plan has. */
  lastDay: string;
  /** The local day of each finished session that belongs to the plan. */
  sessionDays: string[];
};

export type ReportEntry = { assignmentId: string; block: number; start: string; end: string };

/**
 * The reports a client can open, newest first: a finished block with sessions in at least two of its
 * four weeks (under that there is nothing to compare). A canceled plan has none.
 */
export function reportBlocks(plans: PlanForReports[], today: string): ReportEntry[] {
  const out: ReportEntry[] = [];
  for (const p of plans) {
    if (p.status === "CANCELED") continue;
    const blocks = Math.max(1, Math.ceil((daysBetween(p.startDay, p.lastDay) + 1) / BLOCK_DAYS));
    for (let block = 1; block <= blocks; block++) {
      if (!blockEnded(p.startDay, block, today)) continue;
      const weeks = new Set<number>();
      for (const day of p.sessionDays) {
        const w = weekInBlock(p.startDay, block, day);
        if (w != null) weeks.add(w);
      }
      if (weeks.size < 2) continue;
      out.push({ assignmentId: p.id, block, ...blockRange(p.startDay, block) });
    }
  }
  return out.sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : b.block - a.block));
}
