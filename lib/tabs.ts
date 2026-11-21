/**
 * Tapping a tab (the bottom bar, the top nav). The tab shows as chosen at once (`pending`) while its page loads;
 * a repeat tap on it is nothing; a tap on a different tab is never held up by it (the latest tap wins).
 *
 * Pure: no I/O.
 */

export type TabStep = {
  /** The tab to show as chosen right now, or null for "whichever the page is on". */
  pending: string | null;
  /** Start a navigation to the tapped tab. */
  navigate: boolean;
};

/**
 * @param pending the tab already being loaded, if any
 * @param href    the tab just tapped
 * @param current whether `href` is the tab the page is already on
 */
export function tapTab(pending: string | null, href: string, current: boolean): TabStep {
  if (href === pending) return { pending, navigate: false }; // already on its way: a second tap changes nothing
  if (current) return { pending: null, navigate: true }; // back to where the page already is (or a plain refresh of it)
  return { pending: href, navigate: true };
}

/** Which tab looks chosen: the one being loaded, else the one the page is on. */
export const chosenTab = (pending: string | null, href: string, onPage: boolean) => (pending != null ? href === pending : onPage);
