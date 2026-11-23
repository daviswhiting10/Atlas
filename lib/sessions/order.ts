/**
 * The order of exercises in one session, when the coach moves them around
 * (a machine is taken). A session's order never changes the plan: the plan
 * keeps `AssignedWorkoutExercise.order` and `section`; the session keeps its
 * own list of { aweId, section } and the logger shows that instead.
 *
 * Sets follow their exercise without moving: a SetLog points at its
 * AssignedWorkoutExercise, not at a position.
 *
 * Moving is direct, on the cards themselves (no mode):
 * - a drop **between** rows reorders and never merges (dropAt); a drop inside
 *   another block's run lands just below that block;
 * - holding over a row's middle and letting go supersets the two (mergeWith);
 * - dropping a member outside its block splits it out on its own.
 * Blocks are then renumbered in order, so an emptied block disappears and the
 * labels (1A, 1B, 2…) stay sensible. stepOrder is the same for Up/Down buttons
 * (screen readers).
 *
 * Pure: no I/O.
 */

import { COOLDOWN, WARMUP, blockSection, canonicalSections, readSection, structure } from "@/lib/workouts/structure";

// Kept on the phone (lib/sessions/live) and cleared when the session is finished. If history
// ever needs the order a session was done in, it comes from the sets' createdAt, not a column.

export type OrderEntry = { aweId: string; section: string };
export type PlanEntry = { aweId: string; section: string | null };

/**
 * Sections in canonical form, blocks numbered 1, 2, 3… in the order they appear, and the
 * entries in the order they're shown (warm-up, blocks, cool-down), so a position in this list
 * is a position on the screen.
 */
function normalise(entries: OrderEntry[]): OrderEntry[] {
  const sections = canonicalSections(entries, (e) => e.section);
  const rank = (s: string) => (s === WARMUP ? 0 : s === COOLDOWN ? 2 : 1);
  return entries
    .map((e, i) => ({ aweId: e.aweId, section: sections[i], i }))
    .sort((a, b) => rank(a.section) - rank(b.section) || a.i - b.i)
    .map(({ aweId, section }) => ({ aweId, section }));
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

type Part = "warmup" | "block" | "cooldown";
const partOf = (section: string): Part => (section === WARMUP ? "warmup" : section === COOLDOWN ? "cooldown" : "block");
/** A section that makes an exercise a block of its own (renumbered by normalise). */
const SINGLE = "";
const same = (a: OrderEntry[], b: OrderEntry[]) => a.length === b.length && a.every((e, i) => e.aweId === b[i].aweId && e.section === b[i].section);

/**
 * Drop an exercise into a gap between the other exercises: `gap` counts the others above it
 * (0 = before all of them). Its original place is a no-op. Never merges:
 * - inside its own block's run: it stays in its block (the halves of a superset swap);
 * - inside another block's run: it lands just below that block, on its own;
 * - between parts or blocks: it keeps its part when that's on either side (a warm-up stays a
 *   warm-up), otherwise it becomes a block of its own; next to only a warm-up or cool-down, it
 *   joins it (nothing goes above the warm-up or below the cool-down).
 */
export function dropAt(order: OrderEntry[], aweId: string, gap: number): OrderEntry[] {
  const o = normalise(order);
  const from = o.findIndex((e) => e.aweId === aweId);
  if (from === -1) return o;
  const me = o[from];
  const others = o.filter((e) => e.aweId !== aweId);
  let at = Math.max(0, Math.min(gap, others.length));
  if (at === from) return o;
  const above = others[at - 1];
  const below = others[at];
  let section: string;
  if (above && below && above.section === below.section) {
    if (partOf(above.section) !== "block") section = above.section;
    else if (above.section === me.section) section = me.section;
    else {
      while (others[at]?.section === above.section) at++;
      if (at === from) return o;
      section = SINGLE;
    }
  } else {
    const sides = [above, below].filter((e): e is OrderEntry => e != null).map((e) => partOf(e.section));
    const mine = partOf(me.section);
    if (sides.includes(mine)) section = mine === "block" ? SINGLE : me.section;
    else if (sides.includes("block")) section = SINGLE;
    else section = sides[0] === "warmup" ? WARMUP : COOLDOWN;
  }
  return normalise([...others.slice(0, at), { aweId, section }, ...others.slice(at)]);
}

/** The exercises in `aweId`'s superset, itself included, in order. Empty when it isn't in one (or is a warm-up or cool-down). */
export function groupOf(order: OrderEntry[], aweId: string): string[] {
  const o = normalise(order);
  const me = o.find((e) => e.aweId === aweId);
  if (!me || partOf(me.section) !== "block") return [];
  const members = o.filter((e) => e.section === me.section).map((e) => e.aweId);
  return members.length > 1 ? members : [];
}

/**
 * A member dropped inside its superset's outline stays in it: it moves among the members only (`gap` counts the others
 * above it, as in dropAt, and is held to the group's own range).
 */
export function dropWithin(order: OrderEntry[], aweId: string, gap: number): OrderEntry[] {
  const o = normalise(order);
  const me = o.find((e) => e.aweId === aweId);
  if (!me) return o;
  const others = o.filter((e) => e.aweId !== aweId);
  const first = others.findIndex((e) => e.section === me.section);
  if (first === -1) return o;
  const last = first + others.filter((e) => e.section === me.section).length;
  const at = Math.max(first, Math.min(gap, last));
  return normalise([...others.slice(0, at), me, ...others.slice(at)]);
}

/**
 * A member dropped outside its superset's outline leaves it: on its own, at the gap it was dropped in (the same spot as
 * before when that is where it was, so it simply comes out of the group).
 */
export function ungroupAt(order: OrderEntry[], aweId: string, gap: number): OrderEntry[] {
  const o = normalise(order);
  if (partOf(o.find((e) => e.aweId === aweId)?.section ?? "") !== "block") return dropAt(o, aweId, gap);
  // Taken out at the end of its group first (a member from the middle would split the rest), then placed at the gap.
  const me = o.find((e) => e.aweId === aweId)!;
  const rest = o.filter((e) => e.aweId !== aweId);
  const lastIn = rest.map((e) => e.section).lastIndexOf(me.section);
  const edged = lastIn === -1 ? o : [...rest.slice(0, lastIn + 1), me, ...rest.slice(lastIn + 1)];
  return dropAt(
    normalise(edged.map((e) => (e.aweId === aweId ? { ...e, section: SINGLE } : e))),
    aweId,
    gap
  );
}

/** Can `aweId` be held over `targetId` to superset them? Only onto a block's exercise. */
export function canMerge(order: OrderEntry[], aweId: string, targetId: string): boolean {
  const target = order.find((e) => e.aweId === targetId);
  return aweId !== targetId && target != null && partOf(target.section) === "block";
}

/**
 * Superset an exercise with another: it joins the target's block, right after it. Already in
 * the same block, it takes the target's place instead (the two swap sides).
 */
export function mergeWith(order: OrderEntry[], aweId: string, targetId: string): OrderEntry[] {
  const o = normalise(order);
  if (!canMerge(o, aweId, targetId)) return o;
  const from = o.findIndex((e) => e.aweId === aweId);
  const target = o.find((e) => e.aweId === targetId)!;
  const others = o.filter((e) => e.aweId !== aweId);
  const t = others.findIndex((e) => e.aweId === targetId);
  const before = o[from].section === target.section && from > o.indexOf(target);
  const at = before ? t : t + 1;
  return normalise([...others.slice(0, at), { aweId, section: target.section }, ...others.slice(at)]);
}

/** Up or Down for a screen reader: the nearest drop above or below that changes anything. */
export function stepOrder(order: OrderEntry[], aweId: string, dir: -1 | 1): OrderEntry[] {
  const o = normalise(order);
  const from = o.findIndex((e) => e.aweId === aweId);
  if (from === -1) return o;
  // At the edge of its superset: out of it, where it stands, first.
  const me = o[from];
  const inGroup = partOf(me.section) === "block" && o.some((e, i) => i !== from && e.section === me.section);
  if (inGroup && o[from + dir]?.section !== me.section) return normalise(o.map((e, i) => (i === from ? { ...e, section: SINGLE } : e)));
  for (let g = from + dir; g >= 0 && g < o.length; g += dir) {
    const next = dropAt(o, aweId, g);
    if (!same(next, o)) return next;
  }
  return o;
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
