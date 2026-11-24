"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppNav } from "@/components/athlete/AppNav";
import { CoachNav } from "@/components/coach/CoachNav";
import { HOME, initial, modeOf, sync, tap, type Mode, type Step, type SwitchState } from "@/lib/mode";
import { ModeSwitchContext, type Chrome, type ModeSwitch } from "./context";

/** If the page hasn't switched by now, load it the plain way: the toggle never stays stuck. */
const WATCHDOG_MS = 6000;
const CHROME_KEY = "atlas.chrome.v1";
const DEFAULT_CHROME: Chrome = { demo: false, hasProgress: true };

function readChrome(): Chrome {
  try {
    const c = JSON.parse(window.localStorage.getItem(CHROME_KEY) ?? "null");
    return { demo: c?.demo === true, hasProgress: c?.hasProgress !== false };
  } catch {
    return DEFAULT_CHROME;
  }
}

/**
 * Lives above both sides, so it outlasts the change of layout. A tap on Coach | Me shows the other side's header, toggle and
 * bottom bar at once (a shell with nothing in it yet), while its page loads behind; repeated taps are harmless (lib/mode.ts).
 */
export function ModeSwitchProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const actual = modeOf(pathname);
  const [state, setState] = useState<SwitchState>(() => initial(actual));
  const ref = useRef(state);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [chrome, setChromeState] = useState<Chrome>(DEFAULT_CHROME);
  const chromeRef = useRef(chrome);

  useEffect(() => {
    const c = readChrome();
    chromeRef.current = c;
    setChromeState(c);
  }, []);

  const navigate = useCallback(
    (to: Mode) => {
      clearTimeout(watchdog.current);
      watchdog.current = setTimeout(() => {
        if (ref.current.inflight === to) window.location.assign(HOME[to]);
      }, WATCHDOG_MS);
      startTransition(() => router.push(HOME[to]));
    },
    [router]
  );

  const apply = useCallback(
    (step: Step) => {
      ref.current = step.state;
      setState(step.state);
      if (step.go) navigate(step.go);
      else if (step.state.inflight == null) clearTimeout(watchdog.current);
    },
    [navigate]
  );

  // The page is on `actual`: a navigation landed, or the person moved some other way.
  useEffect(() => apply(sync(ref.current, actual)), [actual, apply]);
  useEffect(() => () => clearTimeout(watchdog.current), []);

  const go = useCallback((target: Mode) => apply(tap(ref.current, target)), [apply]);
  const setChrome = useCallback((c: Partial<Chrome>) => {
    const next = { demo: c.demo ?? chromeRef.current.demo, hasProgress: c.hasProgress ?? chromeRef.current.hasProgress };
    if (next.demo === chromeRef.current.demo && next.hasProgress === chromeRef.current.hasProgress) return;
    chromeRef.current = next;
    setChromeState(next);
    try {
      window.localStorage.setItem(CHROME_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the shell just falls back to its defaults next time.
    }
  }, []);

  const value = useMemo<ModeSwitch>(() => ({ shown: state.shown, go, setChrome }), [state.shown, go, setChrome]);
  const switching = state.shown !== actual;

  return (
    <ModeSwitchContext.Provider value={value}>
      {children}
      {switching && (
        // The other side's chrome, drawn from what is already known, over the page that is about to be replaced.
        <div data-mode-shell={state.shown} className="app-ui fixed inset-0 z-[60] overflow-hidden bg-bone">
          {state.shown === "me" ? (
            <AppNav isDemo={chrome.demo} isCoach hasProgress={chrome.hasProgress} preview="/today" />
          ) : (
            <CoachNav demo={chrome.demo} preview="/dashboard" />
          )}
          <main aria-busy className="mx-auto max-w-5xl px-4 pt-5 sm:px-8" />
        </div>
      )}
    </ModeSwitchContext.Provider>
  );
}
