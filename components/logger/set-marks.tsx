/**
 * The only two marks a set row ever gets beyond its check: a gold ring when the tick set a record (the way
 * History marks a record day), and one small amber dot when the save failed or has been waiting offline a while.
 * Neither moves anything: the ring is a shadow and the dot sits on the check's corner. Nothing is shown for a save that worked.
 */

/** How long a tick may wait offline, unsaved, before its row shows the dot. The queue itself is unchanged. */
export const STUCK_MS = 8000;

/** A finished exercise stays open this long, so the check that finished it is seen, before it folds and the next one opens. Both loggers. */
export const FOLD_DELAY_MS = 450;

/** Put on the check button of a set that set a record. */
export const RECORD_RING = { boxShadow: "0 0 0 2px var(--dusk-bg), 0 0 0 3.5px var(--gold)" } as const;

/** Inside a `relative` check button. */
export function UnsavedDot({ show }: { show: boolean }) {
  if (!show) return null;
  return <span role="img" aria-label="Not saved yet" className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full" style={{ background: "var(--dusk-amber)", boxShadow: "0 0 0 2px var(--dusk-bg)" }} />;
}
