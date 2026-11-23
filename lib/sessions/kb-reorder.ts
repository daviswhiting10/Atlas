/**
 * Moving an exercise from the keyboard, the same moves as the drag (lib/sessions/order), one key at a time:
 *
 *   on a card's handle:  Up / Down move focus to the card above / below
 *                        Space (or Enter) picks the card up
 *   while it is picked:  Up / Down move it one place (out of a superset first, as the buttons do)
 *                        Space (or Enter) drops it where it is;  Escape puts everything back as it was
 *
 * Pure: no I/O. `kbKey` says what to do; the hook does it and says it aloud (`message`, for a live region).
 */
import { stepOrder, type OrderEntry } from "./order";

export type KbState = { id: string; original: OrderEntry[] } | null;

export type KbResult = {
  /** Handled: the caller should `preventDefault`. */
  handled: boolean;
  kb: KbState;
  /** A new order to apply now (a move, or an undo). */
  order?: OrderEntry[];
  /** Move focus to this card's handle. */
  focus?: string;
  /** What to say to a screen reader. */
  message?: string;
};

const place = (order: OrderEntry[], id: string) => `position ${order.findIndex((e) => e.aweId === id) + 1} of ${order.length}`;

export function kbKey(key: string, ctx: { id: string; name: string; order: OrderEntry[]; kb: KbState; nameOf?: (aweId: string) => string }): KbResult {
  const { id, name, order, kb } = ctx;
  const i = order.findIndex((e) => e.aweId === id);
  if (i === -1) return { handled: false, kb };
  const up = key === "ArrowUp";
  const down = key === "ArrowDown";
  const space = key === " " || key === "Spacebar" || key === "Enter";

  if (!kb) {
    if (up || down) {
      const to = order[i + (up ? -1 : 1)];
      return to ? { handled: true, kb, focus: to.aweId } : { handled: true, kb };
    }
    if (space) return { handled: true, kb: { id, original: order }, message: `${name} picked up, ${place(order, id)}. Up and Down move it, Space drops it, Escape cancels.` };
    return { handled: false, kb };
  }

  if (kb.id !== id) return { handled: false, kb };
  if (up || down) {
    const next = stepOrder(order, id, up ? -1 : 1);
    const moved = JSON.stringify(next) !== JSON.stringify(order);
    return { handled: true, kb, order: moved ? next : undefined, focus: id, message: moved ? `${name} moved to ${place(next, id)}.` : `${name} can't go ${up ? "up" : "down"} any further, ${place(order, id)}.` };
  }
  if (space) return { handled: true, kb: null, message: `${name} dropped at ${place(order, id)}.` };
  if (key === "Escape") return { handled: true, kb: null, order: kb.original, focus: id, message: `Move cancelled. ${name} is back at ${place(kb.original, id)}.` };
  return { handled: false, kb };
}
