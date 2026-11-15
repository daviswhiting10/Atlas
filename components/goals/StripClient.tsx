"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTodayLive } from "./TodayLive";

/** Layout effects warn when rendered on the server; on the server this is a no-op. */
export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Strips already filled in during this page load, so the fill-in happens once per visit. */
const revealed = new Set<string>();

/**
 * The field of dots. The first time a strip is shown in a visit its dots arrive
 * in turn (CSS: app/dusk.css, "The strip filling in"); after that it is simply
 * there. It starts `pending`, which keeps every dot's space but hides it, so the
 * first paint can't show a strip that then blinks away.
 */
export function StripField({ id, children, className, style, ...aria }: { id: string; children: ReactNode; className?: string; style?: CSSProperties; role?: string; "aria-label"?: string }) {
  const [mode, setMode] = useState<"pending" | "run" | "done">("pending");
  // Decided once per mount: in development React runs effects twice, and the second run must agree with the first.
  const first = useRef<boolean | null>(null);
  useIsoLayoutEffect(() => {
    if (first.current === null) {
      first.current = !revealed.has(id);
      revealed.add(id);
    }
    setMode(first.current && !prefersReducedMotion() ? "run" : "done");
  }, [id]);
  return (
    <div className={className} style={style} data-reveal={mode} {...aria}>
      {children}
    </div>
  );
}

/**
 * Today's dot. While the card's live state says the day is done it shows as
 * done, so ticking the last rule fills this dot straight away; it then fills with
 * a soft glow (`data-pop`, for a moment). Outside a card it just draws the cell it is given.
 */
export function TodayDot({ index, state, title, restart }: { index: number; state: string; title: string; restart?: boolean }) {
  const live = useTodayLive();
  const shown = live && (state === "open" || state === "met") ? (live.dayDone ? "met" : "open") : state;
  const [pop, setPop] = useState(false);
  const was = useRef(shown);
  useEffect(() => {
    const filled = shown === "met" && was.current !== "met";
    was.current = shown;
    if (!filled || prefersReducedMotion()) return;
    setPop(true);
    const t = setTimeout(() => setPop(false), 520);
    return () => clearTimeout(t);
  }, [shown]);
  return <span className="dusk-dot" style={{ "--i": index } as CSSProperties} data-state={shown} data-today="" data-pop={pop ? "" : undefined} data-restart={restart ? "" : undefined} title={title} />;
}
