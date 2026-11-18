"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canMerge, dropAt, mergeWith, type OrderEntry } from "@/lib/sessions/order";

/** Holding a card's header this long picks it up. */
export const LIFT_MS = 250;
/** Hovering over a card's middle this long makes it the merge target. */
export const MERGE_MS = 500;
/** A finger that moves this far before the lift is scrolling, not holding. */
const SLOP = 8;
/** Space between two cards, added to the lifted card's height for the slot it opens. */
const SPACING = 8;

type Rect = { top: number; bottom: number };
type Drag = {
  id: string;
  /** Its index in the order, and the other exercises in order without it. */
  from: number;
  others: string[];
  /** Every card's place on the page when it was picked up. */
  rects: Map<string, Rect>;
  /** Its height while carried: just the header, so a tall open card doesn't cover where it's going. */
  compact: number;
  /** The slot it opens (that height plus the spacing). */
  h: number;
  startY: number;
  y: number;
  /** Where it drops: how many of the others are above it. */
  gap: number;
  /** The card under the finger's middle (the merge timer is running). */
  hover: string | null;
  /** Hovered long enough: letting go supersets the two. */
  merge: string | null;
};

const buzz = (ms: number) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(ms);
};

/**
 * Moving exercises by direct manipulation, with no mode: tap a card's header to fold or open
 * it; press and hold it (LIFT_MS) to pick the card up and drag it. Letting go between cards
 * reorders (never merges); holding over a card's middle for MERGE_MS and letting go supersets
 * the two (lib/sessions/order). The page doesn't scroll under a lifted card; near the top or
 * bottom edge it scrolls by itself.
 */
export function useDragOrder({ order, enabled, onChange }: { order: OrderEntry[]; enabled: boolean; onChange: (o: OrderEntry[]) => void }) {
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const press = useRef<{ id: string; x: number; y: number; header: HTMLElement; timer: ReturnType<typeof setTimeout> } | null>(null);
  const swallowClick = useRef(false);
  const mergeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientY = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  // A lifted card owns the finger: the page mustn't scroll under it. (Non-passive, so it can cancel.)
  useEffect(() => {
    const h = (e: TouchEvent) => {
      if (dragRef.current && e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", h, { passive: false });
    return () => document.removeEventListener("touchmove", h);
  }, []);

  /** Where card k of the others shows now: pushed down or pulled up by the open slot. */
  const shiftOf = (d: Drag, k: number) => (k < d.from ? (k >= d.gap ? d.h : 0) : k < d.gap ? -d.h : 0);

  const update = useCallback((pageY: number) => {
    const d = dragRef.current;
    if (!d) return;
    /** The card under the finger with the slot at `g`: its index among the others and where it shows. */
    const under = (g: number) => {
      const at = { ...d, gap: g };
      for (let k = 0; k < d.others.length; k++) {
        const r = d.rects.get(d.others[k]);
        if (!r) continue;
        const top = r.top + shiftOf(at, k);
        const bottom = r.bottom + shiftOf(at, k);
        if (pageY >= top && pageY <= bottom) return { k, top, bottom };
      }
      return null;
    };
    // The drop is always above or below the card the finger is on (whichever half), so letting go
    // before a merge arms lands exactly where the line shows. In the open slot or a margin, it's
    // wherever the cards' middles say.
    const on = under(d.gap);
    const gap = on
      ? pageY < (on.top + on.bottom) / 2
        ? on.k
        : on.k + 1
      : d.others.filter((id, k) => {
          const r = d.rects.get(id);
          return r != null && (r.top + r.bottom) / 2 + shiftOf(d, k) < pageY;
        }).length;
    // A card's middle starts the merge timer: the card as it shows once the slot has moved, so a
    // card that just slid away from under the finger never glows.
    const now = under(gap);
    let hover: string | null = null;
    if (now) {
      const band = Math.min(Math.max((now.bottom - now.top) * 0.25, 8), 48);
      const id = d.others[now.k];
      if (canMerge(orderRef.current, d.id, id) && pageY >= now.top + band && pageY <= now.bottom - band) hover = id;
    }

    let merge = d.merge;
    if (hover !== d.hover) {
      if (mergeTimer.current) clearTimeout(mergeTimer.current);
      mergeTimer.current = null;
      merge = null;
      if (hover) {
        const target = hover;
        mergeTimer.current = setTimeout(() => {
          const cur = dragRef.current;
          if (cur && cur.hover === target) {
            setDrag({ ...cur, merge: target });
            buzz(15);
          }
        }, MERGE_MS);
      }
    }
    setDrag({ ...d, y: pageY, gap, hover, merge });
  }, []);

  // Near an edge, the page scrolls under the lifted card.
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      const y = clientY.current;
      const dy = y < 120 ? -10 : y > window.innerHeight - 150 ? 10 : 0;
      if (dy !== 0) {
        window.scrollBy(0, dy);
        update(y + window.scrollY);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag != null, update]); // eslint-disable-line react-hooks/exhaustive-deps

  // Window listeners that stay the same function for the whole gesture (so they can be removed),
  // calling the latest handlers.
  const moveRef = useRef<(e: PointerEvent) => void>(() => {});
  const endRef = useRef<(commit: boolean) => void>(() => {});
  const listeners = useRef({
    move: (e: PointerEvent) => moveRef.current(e),
    up: () => endRef.current(true),
    cancel: () => endRef.current(false),
  }).current;

  function end(commit: boolean) {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    if (mergeTimer.current) clearTimeout(mergeTimer.current);
    mergeTimer.current = null;
    const d = dragRef.current;
    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.up);
    window.removeEventListener("pointercancel", listeners.cancel);
    if (!d) return;
    setDrag(null);
    if (!commit) return;
    const o = orderRef.current;
    const next = d.merge ? mergeWith(o, d.id, d.merge) : dropAt(o, d.id, d.gap);
    if (JSON.stringify(next) !== JSON.stringify(o)) onChangeRef.current(next);
  }
  endRef.current = end;

  function lift(id: string) {
    const list = listRef.current;
    if (!list) return;
    const ids = orderRef.current.map((e) => e.aweId);
    const from = ids.indexOf(id);
    if (from === -1) return;
    const rects = new Map<string, Rect>();
    list.querySelectorAll<HTMLElement>("[data-exercise]").forEach((el) => {
      const b = el.getBoundingClientRect();
      rects.set(el.dataset.exercise!, { top: b.top + window.scrollY, bottom: b.bottom + window.scrollY });
    });
    const mine = rects.get(id);
    if (!mine) return;
    // Carried as its header only: the cards below it close up by the rest of its height.
    const header = press.current?.header.getBoundingClientRect();
    const full = mine.bottom - mine.top;
    const compact = header ? Math.min(full, header.bottom + window.scrollY - mine.top + 6) : full;
    const closeUp = full - compact;
    ids.forEach((x, i) => {
      const r = rects.get(x);
      if (i > from && r) rects.set(x, { top: r.top - closeUp, bottom: r.bottom - closeUp });
    });
    rects.set(id, { top: mine.top, bottom: mine.top + compact });
    const y = clientY.current + window.scrollY;
    swallowClick.current = true;
    buzz(10);
    setDrag({ id, from, others: ids.filter((x) => x !== id), rects, compact, h: compact + SPACING, startY: y, y, gap: from, hover: null, merge: null });
  }

  function onMove(e: PointerEvent) {
    clientY.current = e.clientY;
    const p = press.current;
    if (!dragRef.current) {
      // Moving before the lift is a scroll: let it be.
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) end(false);
      return;
    }
    update(e.clientY + window.scrollY);
  }
  moveRef.current = onMove;

  /** Spread onto a card's header: the hold that picks it up. */
  const bind = (id: string) =>
    enabled
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            if (e.button !== 0 || (e.target as HTMLElement).closest("input, textarea")) return;
            swallowClick.current = false;
            end(false);
            clientY.current = e.clientY;
            press.current = { id, x: e.clientX, y: e.clientY, header: e.currentTarget as HTMLElement, timer: setTimeout(() => lift(id), LIFT_MS) };
            window.addEventListener("pointermove", listeners.move);
            window.addEventListener("pointerup", listeners.up);
            window.addEventListener("pointercancel", listeners.cancel);
          },
          // The click after a lift isn't a tap.
          onClickCapture: (e: React.MouseEvent) => {
            if (!swallowClick.current) return;
            swallowClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          },
          // The phone's own long-press menu would cover the card.
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        }
      : {};

  /** The card's look while something is lifted: following the finger, sliding aside, or glowing as the merge target. */
  function styleFor(id: string): React.CSSProperties | undefined {
    const d = drag;
    if (!d) return undefined;
    if (id === d.id) {
      return {
        position: "relative",
        zIndex: 30,
        translate: `0 ${d.y - d.startY}px`,
        scale: "1.03",
        maxHeight: d.compact,
        overflow: "hidden",
        // Over a merge target: see-through, so the glowing card under it shows.
        opacity: d.merge ? 0.6 : 1,
        boxShadow: "0 18px 40px -12px rgba(0,0,0,0.85)",
        transition: "scale 120ms ease-out, box-shadow 120ms ease-out, opacity 120ms ease-out",
      };
    }
    const k = d.others.indexOf(id);
    const glow = d.merge === id;
    return {
      translate: `0 ${shiftOf(d, k)}px`,
      scale: glow ? "1.025" : undefined,
      boxShadow: glow ? "0 0 0 2px var(--dusk-teal), 0 0 28px -6px var(--dusk-teal)" : undefined,
      transition: "translate 160ms cubic-bezier(0.2, 0.8, 0.2, 1), scale 120ms ease-out, box-shadow 120ms ease-out",
    };
  }

  /** Where the insertion line goes, relative to the list (null: no line). */
  let lineTop: number | null = null;
  if (drag && !drag.merge && drag.gap !== drag.from && listRef.current) {
    const listTop = listRef.current.getBoundingClientRect().top + window.scrollY;
    const d = drag;
    const y =
      d.gap === 0
        ? (d.rects.get(d.others[0])?.top ?? 0) - SPACING
        : (d.rects.get(d.others[d.gap - 1])?.bottom ?? 0) + shiftOf(d, d.gap - 1) + SPACING / 2 - 1;
    lineTop = y - listTop;
  }

  return { listRef, bind, styleFor, lineTop, lifted: drag?.id ?? null, mergeTarget: drag?.merge ?? null };
}
