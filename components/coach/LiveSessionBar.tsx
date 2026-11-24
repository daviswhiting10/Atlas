"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, X } from "lucide-react";
import { liveTransitionTo } from "@/lib/live-transition";
import { LIVE_EVENT, LIVE_KEY, clearLive, formatElapsed, liveIsFresh, readLiveFor, type LiveSession } from "@/lib/sessions/live";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * "Currently logging": the session left open in the logger, on every other
 * coach screen, just above the bottom nav (like a now-playing bar). A tap goes
 * back to exactly where the coach was; the cross hides it (logged sets stay
 * saved either way).
 *
 * Minimal on purpose: the logger's redesign owns the look.
 */
export function LiveSessionBar({ owner }: { /** The signed-in coach: only their own session shows. */ owner: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [live, setLive] = useState<LiveSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => setLive(readLiveFor(storage(), owner));
    load();
    const onStorage = (e: StorageEvent) => e.key === LIVE_KEY && load();
    window.addEventListener(LIVE_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LIVE_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, [pathname, owner]);

  const onLogger = live != null && pathname === live.href.split("?")[0];
  // Gone once the session has sat untouched for 3 hours, even while this screen stays open.
  const visible = live != null && !onLogger && liveIsFresh(live, now);

  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  // The logger's shell is ready before the tap: the bar can grow into it at once.
  const href = live?.href;
  useEffect(() => {
    if (visible && href) router.prefetch(href);
  }, [visible, href, router]);

  if (!visible || !live) return null;

  return (
    <>
    {/* Room at the end of the page so the bar never covers the last of it. */}
    <div aria-hidden className="h-16" />
    <div
      className="fixed inset-x-0 z-30 px-3 md:bottom-4 bottom-[calc(env(safe-area-inset-bottom,0px)+64px)]"
      role="region"
      aria-label="Currently logging"
    >
      <div ref={bar} data-live-bar className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-line-strong bg-dusk-raised p-1.5 shadow-lg md:max-w-xl">
        <button
          type="button"
          onClick={() => liveTransitionTo(router, live.href, bar.current)}
          className="press flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 text-left"
        >
          <ClipboardList className="h-4 w-4 shrink-0 text-signal" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{live.clientName}</span>
            <span className="block truncate text-xs text-ink-mute">{live.workoutName}</span>
          </span>
          <span className="tnum shrink-0 text-sm font-medium text-ink-soft" aria-label="Elapsed">
            {formatElapsed(now - live.startedAt)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            clearLive(storage(), live.assignedWorkoutId);
            setLive(null);
          }}
          aria-label="Hide the currently logging bar"
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-mute hover:bg-ink/5 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
    </>
  );
}
