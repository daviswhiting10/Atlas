"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createOptimisticFlags, stillOverridden, type OptimisticFlags, type SaveResult } from "@/lib/goals/optimistic";
import type { TodayView } from "@/lib/goals/today";

/** The saves the card makes. The page passes the real server actions; a preview can pass fakes. */
export type GoalActions = {
  tickRule(raw: unknown): Promise<SaveResult>;
  tagSession(raw: unknown): Promise<SaveResult>;
  setSessionDuration(raw: unknown): Promise<SaveResult>;
  addGoalRule(raw: unknown): Promise<SaveResult>;
  removeGoalRule(raw: unknown): Promise<SaveResult>;
  endGoal(raw: unknown): Promise<SaveResult>;
};

type Live = {
  view: TodayView;
  /** Is this rule ticked for that day? Shows a tap straight away. */
  ticked(key: string, serverState: string, day: string): boolean;
  toggleTick(key: string, day: string, now: boolean): void;
  tagged(sessionId: string, mark: string, had: boolean): boolean;
  toggleTag(sessionId: string, mark: string, now: boolean): void;
  saveMinutes(sessionId: string, minutes: number): Promise<boolean>;
  /** Every rule for today is done (counting taps not yet saved). */
  dayDone: boolean;
};

const Ctx = createContext<Live | null>(null);

/** The card's live state, or null outside a card (so a dot can also be drawn on its own). */
export const useTodayLive = () => useContext(Ctx);

const tickKey = (day: string, rule: string) => `tick|${day}|${rule}`;
const tagKey = (sessionId: string, mark: string) => `tag|${sessionId}|${mark}`;

/**
 * Holds what the Today card shows while saves are in flight, so the circle, the
 * day's dot and the checklist all agree on the tap. The saving logic is
 * lib/goals/optimistic.ts; this is the React around it.
 */
export function TodayLive({ view, actions, children }: { view: TodayView; actions: GoalActions; children: ReactNode }) {
  const [over, setOver] = useState<Record<string, boolean>>({});
  const viewRef = useRef(view);
  viewRef.current = view;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const flagsRef = useRef<OptimisticFlags | null>(null);
  if (flagsRef.current === null) {
    flagsRef.current = createOptimisticFlags({
      save: (key, on) => {
        const [kind, a, b] = key.split("|");
        const goalId = viewRef.current.goalId;
        return kind === "tick" ? actionsRef.current.tickRule({ goalId, ruleKey: b, day: a, on }) : actionsRef.current.tagSession({ goalId, sessionId: a, mark: b, on });
      },
      apply: (key, on) => setOver((o) => ({ ...o, [key]: on })),
      fail: (key, error) => {
        const [kind, a, b] = key.split("|");
        const v = viewRef.current;
        const what = kind === "tick" ? v.rules.find((r) => r.key === b)?.label : v.sessions.find((s) => s.id === a)?.title;
        // Quiet on purpose: a plain note at the top, no red, nothing to dismiss.
        toast(error ?? `${what ?? "That"} didn't save, so it's back as it was.`, { duration: 3500 });
      },
    });
  }
  const flags = flagsRef.current;

  // When fresh data arrives, forget overrides the server now agrees with.
  useEffect(() => {
    const server: Record<string, boolean | undefined> = {};
    for (const r of view.rules) if (r.kind === "check_in") server[tickKey(view.today, r.key)] = r.state === "met";
    if (view.behind) for (const it of view.behind.items) if (it.kind === "check_in") server[tickKey(view.behind.day, it.key)] = false;
    for (const s of view.sessions) for (const m of view.marks) server[tagKey(s.id, m)] = s.tags.includes(m);
    setOver((o) => {
      const next = stillOverridden(o, server, (k) => flags.busy(k));
      return Object.keys(next).length === Object.keys(o).length ? o : next;
    });
  }, [view, flags]);

  const ticked = useCallback((key: string, state: string, day: string) => over[tickKey(day, key)] ?? state === "met", [over]);
  const toggleTick = useCallback((key: string, day: string, now: boolean) => flags.set(tickKey(day, key), !now, now), [flags]);
  const tagged = useCallback((sessionId: string, mark: string, had: boolean) => over[tagKey(sessionId, mark)] ?? had, [over]);
  const toggleTag = useCallback((sessionId: string, mark: string, now: boolean) => flags.set(tagKey(sessionId, mark), !now, now), [flags]);
  const saveMinutes = useCallback(async (sessionId: string, minutes: number) => {
    const r = await actionsRef.current.setSessionDuration({ goalId: viewRef.current.goalId, sessionId, minutes }).catch(() => ({ ok: false, error: undefined }) as SaveResult);
    if (!r.ok) toast(r.error ?? "That didn't save. Try again.", { duration: 3500 });
    return r.ok;
  }, []);

  const dayDone = view.rules.every((r) => (r.kind === "check_in" ? (over[tickKey(view.today, r.key)] ?? r.state === "met") : r.state === "met"));

  const value = useMemo<Live>(() => ({ view, ticked, toggleTick, tagged, toggleTag, saveMinutes, dayDone }), [view, ticked, toggleTick, tagged, toggleTag, saveMinutes, dayDone]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
