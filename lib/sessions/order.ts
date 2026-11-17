/**
 * The order of exercises in one session, when the coach moves them around
 * (a machine is taken). A session's order never changes the plan: the plan
 * keeps `AssignedWorkoutExercise.order` and `section`; the session keeps its
 * own list of { aweId, section } and the logger shows that instead.
 *
 * Sets follow their exercise without moving: a SetLog points at its
 * AssignedWorkoutExercise, not at a position.
 *
 * Reorder mode is a flat list of rows: a heading for each part (Warm-up,
 * Block 1…n, a "new block" slot, Cool-down) with the exercises under them.
 * Dragging, or Up/Down, moves an exercise between rows; what heading it ends
 * up under decides its part. Blocks are then renumbered in order, so an
 * emptied block disappears and the labels (1A, 1B, 2…) stay sensible.
 *
 * Pure: no I/O.
 */

import { COOLDOWN, WARMUP, blockSection, canonicalSections, readSection, structure } from "@/lib/workouts/structure";

export type OrderEntry = { aweId: string; section: string };
export type PlanEntry = { aweId: string; section: string | null };

/** A new block, made by dropping an exercise on the slot after the last block. */
export const NEW_BLOCK = "block:new";

export type ReorderRow = { kind: "heading"; section: string; title: string } | { kind: "item"; aweId: string };

/** Sections in canonical form and blocks numbered 1, 2, 3… in the order they appear. */
function normalise(entries: OrderEntry[]): OrderEntry[] {
  const sections = canonicalSections(entries, (e) => e.section);
  return entries.map((e, i) => ({ aweId: e.aweId, section: sections[i] }));
}

/**
 * The session's order: the saved one, or the plan's when nothing was moved.
 * An exercise the saved order doesn't know (added mid-session) goes at the end
 * of its part; one that's gone from the plan (dropped today) is left out.
 */
export function sessionOrder(plan: PlanEntry[], saved: OrderEntry[] | null | undefined): OrderEntry[] {
  const planOrder = normalise(plan.map((p) => ({ aweId: p.aweId, section: p.section ?? "" })));
  if (!saved || saved.length === 0) return planOrder;
  const present = new Set(plan.map((p) => p.aweId));
  const kept = saved.filter((e) => present.has(e.aweId));
  const known = new Set(kept.map((e) => e.aweId));
  const added = planOrder.filter((e) => !known.has(e.aweId));
  // Added exercises keep their plan part; a plan block of their own becomes a new block at the end.
  const lastBlock = kept.reduce((n, e) => {
    const m = /^block:(\d+)$/.exec(e.section);
    return m ? Math.max(n, Number(m[1])) : n;
  }, 0);
  const shifted = added.map((e, i) => (readSection(e.section).kind === "group" ? { ...e, section: blockSection(lastBlock + 1 + i) } : e));
  return normalise([...kept, ...shifted]);
}

/** The order as rows for reorder mode: every part's heading, its exercises, and a slot for a new block. */
export function toRows(order: OrderEntry[]): ReorderRow[] {
  const s = structure(order, (e) => e.section);
  const rows: ReorderRow[] = [{ kind: "heading", section: WARMUP, title: "Warm-up" }];
  for (const it of s.warmup) rows.push({ kind: "item", aweId: it.item.aweId });
  for (const b of s.blocks) {
    rows.push({ kind: "heading", section: blockSection(b.n), title: `Block ${b.n}` });
    for (const it of b.items) rows.push({ kind: "item", aweId: it.item.aweId });
  }
  rows.push({ kind: "heading", section: NEW_BLOCK, title: "New block" });
  rows.push({ kind: "heading", section: COOLDOWN, title: "Cool-down" });
  for (const it of s.cooldown) rows.push({ kind: "item", aweId: it.item.aweId });
  return rows;
}

/** Rows back to an order: each exercise takes the part of the heading above it. */
export function fromRows(rows: ReorderRow[]): OrderEntry[] {
  const out: OrderEntry[] = [];
  let section = WARMUP;
  for (const r of rows) {
    if (r.kind === "heading") section = r.section === NEW_BLOCK ? "block:99" : r.section;
    else out.push({ aweId: r.aweId, section });
  }
  return normalise(out);
}

/**
 * Move one exercise to a row position (the index it should have once moved).
 * Index 0 is above the Warm-up heading, so it's clamped to just under it.
 */
export function moveRow(rows: ReorderRow[], aweId: string, to: number): ReorderRow[] {
  const from = rows.findIndex((r) => r.kind === "item" && r.aweId === aweId);
  if (from === -1) return rows;
  const without = rows.filter((_, i) => i !== from);
  const at = Math.max(1, Math.min(to, without.length));
  return [...without.slice(0, at), rows[from], ...without.slice(at)];
}

/** Up or Down one row (crossing a heading moves it into the next part). */
export function stepRow(rows: ReorderRow[], aweId: string, dir: -1 | 1): ReorderRow[] {
  const from = rows.findIndex((r) => r.kind === "item" && r.aweId === aweId);
  if (from === -1) return rows;
  return moveRow(rows, aweId, from + dir);
}

/** Moving an exercise: the order after it, ready to save. */
export function move(order: OrderEntry[], aweId: string, to: number): OrderEntry[] {
  return fromRows(moveRow(toRows(order), aweId, to));
}

/** Each exercise's label in this order: "1A", "2", or "W" / "C". */
export function labelsOf(order: OrderEntry[]): Record<string, string> {
  const s = structure(order, (e) => e.section);
  const out: Record<string, string> = {};
  for (const it of s.warmup) out[it.item.aweId] = "W";
  for (const it of s.cooldown) out[it.item.aweId] = "C";
  for (const b of s.blocks) for (const it of b.items) out[it.item.aweId] = it.label ?? String(b.n);
  return out;
}

/**
 * Supersets the move split up: for each exercise that was paired in the plan
 * and no longer shares a block with a partner that's still in the session,
 * the label it had in the plan ("was 1A").
 */
export function splitPairs(plan: PlanEntry[], order: OrderEntry[]): Record<string, string> {
  const planOrder = normalise(plan.map((p) => ({ aweId: p.aweId, section: p.section ?? "" })));
  const planLabels = labelsOf(planOrder);
  const blockOf = (o: OrderEntry[]) => new Map(o.map((e) => [e.aweId, e.section]));
  const planBlock = blockOf(planOrder);
  const nowBlock = blockOf(order);
  const out: Record<string, string> = {};
  for (const e of planOrder) {
    if (readSection(e.section).kind !== "group") continue;
    const partners = planOrder.filter((p) => p.aweId !== e.aweId && planBlock.get(p.aweId) === e.section && nowBlock.has(p.aweId));
    if (partners.length === 0) continue;
    const together = partners.some((p) => nowBlock.get(p.aweId) === nowBlock.get(e.aweId));
    if (!together && nowBlock.has(e.aweId)) out[e.aweId] = planLabels[e.aweId];
  }
  return out;
}
