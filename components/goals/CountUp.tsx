"use client";

import { useRef, useState } from "react";
import { prefersReducedMotion, useIsoLayoutEffect } from "./StripClient";

/** Numbers already counted up during this page load: once per visit. */
const counted = new Set<string>();

/** The easing for the count (ease-out, like --dusk-ease): fast at first, settling at the end. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** The duration from the Dusk token, in ms (falls back to the token's value). */
function countMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--dusk-count").trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? (raw.endsWith("ms") ? n : n * 1000) : 800;
}

/**
 * A number that counts up from 0 the first time it is shown in a visit.
 * The final number is always in the layout (hidden while counting), so the width
 * never changes. Under reduced motion, or after the first time, it is just the number.
 * States and styles: app/dusk.css, "The day number counting up".
 */
export function CountUp({ id, value }: { id: string; value: number }) {
  const live = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<"pending" | "run" | "done">("pending");

  // Decided once per mount and number: in development React runs effects twice, and the second run must agree with the first.
  const decided = useRef<{ key: string; first: boolean } | null>(null);
  useIsoLayoutEffect(() => {
    const key = `${id}:${value}`;
    if (decided.current?.key !== key) {
      decided.current = { key, first: !counted.has(key) };
      counted.add(key);
    }
    if (!decided.current.first || value < 2 || prefersReducedMotion()) {
      setMode("done");
      return;
    }
    setMode("run");
    const el = live.current;
    if (!el) return;
    el.textContent = "0";
    const ms = countMs();
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      el.textContent = String(Math.round(easeOut(t) * value));
      if (t < 1) frame = requestAnimationFrame(step);
      else setMode("done");
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [id, value]);

  return (
    <span className="dusk-count" data-count={mode}>
      <span className="dusk-count-final">{value}</span>
      <span className="dusk-count-live" ref={live} aria-hidden>
        {value}
      </span>
    </span>
  );
}
