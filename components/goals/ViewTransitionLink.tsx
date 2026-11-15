"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, type ComponentProps, type MouseEvent } from "react";
import { prefersReducedMotion, useIsoLayoutEffect } from "./StripClient";

/**
 * The Today card becoming the goal page, with the View Transitions API.
 *
 * - The title and the day number carry across (CSS: `.vt-goal-title`, `.vt-goal-counter`
 *   in app/dusk.css); everything else cross-fades.
 * - **Fallback:** where `document.startViewTransition` doesn't exist, or the person asks for
 *   reduced motion, or a modifier key is held, this is an ordinary link (and the loading
 *   skeleton still shows the card's name and day straight away).
 * - The browser keeps the old screen up until the new one is ready. "Ready" is the
 *   first screen of the goal page (its loading skeleton, or the page itself), which renders
 *   <ViewTransitionArrived /> to say so. A timeout makes sure a failed navigation can't leave
 *   the old screen frozen.
 * - What the skeleton needs to look like the card (the name and the day) travels in `carry`
 *   and stays until the real page has arrived.
 *
 * Only this link starts a transition; no other navigation in the app is touched.
 */

export type Carry = { name: string; day: number; length: number };
type Carried = Carry & { href: string };

type Doc = Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } };

let carried: Carried | null = null;
const listeners = new Set<() => void>();
let arrived: (() => void) | null = null;

const setCarried = (c: Carried | null) => {
  carried = c;
  listeners.forEach((l) => l());
};

/** What the card handed over for the loading screen at `href` to draw, or null. */
export function useCarried(href: string): Carry | null {
  const c = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => carried,
    () => null
  );
  return c && c.href === href ? c : null;
}

/**
 * Put this on the destination's first screen: it tells the browser the new page is ready to be shown.
 * With `settled`, it also drops what the card handed over (the real page has arrived).
 */
export function ViewTransitionArrived({ settled = false }: { settled?: boolean }) {
  useIsoLayoutEffect(() => {
    arrived?.();
    if (settled) setCarried(null);
  }, [settled]);
  return null;
}

export function ViewTransitionLink({ href, carry, onClick, onPointerEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof Link> & { href: string; carry?: Carry }) {
  const router = useRouter();
  // Start fetching the page as soon as a finger or pointer is near, so it is there by the time of the tap.
  const warm = () => router.prefetch(href);

  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (carry) setCarried({ ...carry, href });
    const doc = document as Doc;
    if (!doc.startViewTransition || prefersReducedMotion()) return; // an ordinary link
    e.preventDefault();

    const html = document.documentElement;
    html.setAttribute("data-dusk-vt", "");
    const t = doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => finish(), 1500);
          const finish = () => {
            clearTimeout(timer);
            arrived = null;
            resolve();
          };
          arrived = finish;
          router.push(href);
        })
    );
    t.finished.finally(() => html.removeAttribute("data-dusk-vt"));
  };

  return <Link href={href} onClick={go} onPointerEnter={(e) => (onPointerEnter?.(e), warm())} onFocus={(e) => (onFocus?.(e), warm())} onTouchStart={(e) => (onTouchStart?.(e), warm())} {...rest} />;
}
