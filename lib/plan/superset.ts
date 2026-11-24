/**
 * A superset made (or split) mid-session, kept in the plan: the same change in this workout and in its later instances.
 *
 * Each instance is changed on its own exercises, matched by exerciseId (an instance's rows have their own ids). The
 * grouping uses the session's own rules (lib/sessions/order): the exercises join the first one's block, right after it,
 * and the blocks are renumbered, so the block number never collides with one already there. An instance that lacks one
 * of the exercises is skipped.
 *
 * Pure: no I/O.
 */

import { groupOf, mergeWith, normalise, ungroupAt, type OrderEntry } from "@/lib/sessions/order";

/** One exercise of one plan workout, as stored. */
export type PlanRow = { aweId: string; exerciseId: string; order: number; section: string | null };
/** A row to write: its new place and section. */
export type RowChange = { aweId: string; order: number; section: string };

/** The rows in plan order, as the session would read them (sorted by order, then id: the logger's tie-break). */
const entries = (rows: PlanRow[]): OrderEntry[] =>
  normalise([...rows].sort((a, b) => a.order - b.order || (a.aweId < b.aweId ? -1 : 1)).map((r) => ({ aweId: r.aweId, section: r.section ?? "" })));

/**
 * What changed between the stored rows and the new order: each row whose place (1, 2, 3…) or section differs. Nothing
 * when the workout reads the same as before (older section names like "block_a" are left as they are then).
 */
function diff(rows: PlanRow[], next: OrderEntry[]): RowChange[] {
  const was = entries(rows);
  if (was.length === next.length && was.every((e, i) => e.aweId === next[i].aweId && e.section === next[i].section)) return [];
  const byId = new Map(rows.map((r) => [r.aweId, r]));
  return next.flatMap((e, i) => {
    const r = byId.get(e.aweId)!;
    return r.order === i + 1 && r.section === e.section ? [] : [{ aweId: e.aweId, order: i + 1, section: e.section }];
  });
}

/** This instance's row for each exercise, in the same order; null when one is missing. */
function rowsFor(rows: PlanRow[], exerciseIds: string[]): string[] | null {
  const ids = exerciseIds.map((x) => rows.find((r) => r.exerciseId === x)?.aweId);
  return ids.every((x): x is string => x != null) ? ids : null;
}

/**
 * Superset these exercises (2 or more, in the order they should show) in one workout: each joins the block of the one
 * before it, right after it. Null when the workout lacks one of them (skipped); an empty list when they already are.
 */
export function groupIn(rows: PlanRow[], exerciseIds: string[]): RowChange[] | null {
  const ids = rowsFor(rows, exerciseIds);
  if (!ids) return null;
  let o = entries(rows);
  const at = (id: string) => o.findIndex((e) => e.aweId === id);
  for (let i = 1; i < ids.length; i++) {
    const a = at(ids[i - 1]);
    const b = at(ids[i]);
    if (b === a + 1 && o[b].section === o[a].section) continue; // already right after it, in its block
    // In its block but elsewhere: out of it first, so mergeWith places it rather than swapping the two.
    if (o[b].section === o[a].section) o = o.map((e) => (e.aweId === ids[i] ? { ...e, section: "" } : e));
    o = mergeWith(o, ids[i], ids[i - 1]);
  }
  // A warm-up or cool-down exercise can't be the block (mergeWith refuses): nothing changes there.
  const group = groupOf(o, ids[0]);
  return ids.every((id) => group.includes(id)) ? diff(rows, o) : [];
}

/**
 * Take this exercise out of its superset in one workout: it stays where it is, on its own, after the rest of its block.
 * Null when the workout lacks it (skipped); an empty list when it isn't in a superset there.
 */
export function splitIn(rows: PlanRow[], exerciseId: string): RowChange[] | null {
  const ids = rowsFor(rows, [exerciseId]);
  if (!ids) return null;
  const o = entries(rows);
  const [aweId] = ids;
  const members = groupOf(o, aweId);
  if (members.length === 0) return [];
  // The gap just after its block's last other member: where ungroupAt leaves it.
  const others = o.filter((e) => e.aweId !== aweId).map((e) => e.aweId);
  const last = Math.max(...members.filter((m) => m !== aweId).map((m) => others.indexOf(m)));
  return diff(rows, ungroupAt(o, aweId, last + 1));
}

/** Exercises superset together in an order, as pairs ("a|b", ids sorted), for telling what a move changed. */
export function pairsOf(order: OrderEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of order) {
    for (const m of groupOf(order, e.aweId)) if (m > e.aweId) out.add(`${e.aweId}|${m}`);
  }
  return out;
}

/**
 * What a move in the session did to its supersets, compared with before: a superset made or joined (`group`, its members
 * in order), one exercise taken out of one (`split`), or nothing worth keeping. Only a change the plan doesn't already
 * have is reported: putting back what the plan has needs no question.
 */
export function supersetChange(
  before: OrderEntry[],
  after: OrderEntry[],
  plan: OrderEntry[]
): { kind: "group"; aweIds: string[] } | { kind: "split"; aweId: string } | null {
  const was = pairsOf(before);
  const now = pairsOf(after);
  const inPlan = pairsOf(plan);
  const gained = Array.from(now).filter((p) => !was.has(p));
  const lost = Array.from(was).filter((p) => !now.has(p));
  if (gained.length > 0) {
    if (gained.every((p) => inPlan.has(p))) return null;
    const one = gained[0].split("|")[0];
    return { kind: "group", aweIds: groupOf(after, one) };
  }
  if (lost.length > 0 && lost.some((p) => inPlan.has(p))) {
    // The one that left is in every lost pair; of a pair, the second (it stays where it is).
    const ids = lost.map((p) => p.split("|"));
    const common = ids[0].find((x) => ids.every((pair) => pair.includes(x)));
    const order = after.map((e) => e.aweId);
    const leaver = ids.length > 1 && common ? common : ids[0].sort((a, b) => order.indexOf(a) - order.indexOf(b))[1];
    return { kind: "split", aweId: leaver };
  }
  return null;
}

/** The toast after keeping: "Kept here and in 5 later workouts", and how many were skipped for lack of an exercise. */
export function keptMessage(updated: number, skipped: number): string {
  const later = updated === 0 ? "Kept for this workout" : `Kept here and in ${updated} later workout${updated === 1 ? "" : "s"}`;
  return skipped === 0 ? later : `${later}. ${skipped} skipped: missing an exercise.`;
}
