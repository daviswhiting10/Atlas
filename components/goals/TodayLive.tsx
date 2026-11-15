"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createOptimisticFlags, stillOverridden, type OptimisticFlags, type SaveResult } from "@/lib/goals/optimistic";
import { rowsMeetRule, settlePending, workoutRows, type PendingWorkout, type WorkoutRow } from "@/lib/goals/rows";
import type { TodayView } from "@/lib/goals/today";

export type LogResult = SaveResult & { sessionId?: string };

/** The saves the card makes. The page passes the real server actions; a preview can pass fakes. */
export type GoalActions = {
  tickRule(raw: unknown): Promise<SaveResult>;
  tagSession(raw: unknown): Promise<SaveResult>;
  logWorkout(raw: unknown): Promise<LogResult>;
  setWorkoutMinutes(raw: unknown): Promise<SaveResult>;
  removeWorkout(raw: unknown): Promise<SaveResult>;
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
  /** The workout rows for today, and for yesterday while it is still open (both empty when the goal has no workout slots). */
  rows: { today: WorkoutRow[]; yesterday: WorkoutRow[] };
  /** One tap on an empty row: log "Workout, N min" in the background, for today or for yesterday. */
  logWorkout(outdoors: boolean, which?: "today" | "yesterday"): void;
  /** Change the minutes on a saved workout. */
  editMinutes(sessionId: string, minutes: number): void;
  /** Remove a workout that has no sets (a quiet "Remove" in the minutes editor). */
  removeRow(sessionId: string): void;
  /** Every rule for today is done (counting taps not yet saved). */
  dayDone: boolean;
};

const Ctx = createContext<Live | null>(null);

/** The card's live state, or null outside a card (so a dot can also be drawn on its own). */
export const useTodayLive = () => useContext(Ctx);

const tickKey = (day: string, rule: string) => `tick|${day}|${rule}`;
const tagKey = (sessionId: string, mark: string) => `tag|${sessionId}|${mark}`;

/** A short note at the top: no red, nothing to dismiss. */
const quiet = (message: string) => toast(message, { duration: 3500 });

/**
 * Holds what the Today card shows while saves are in flight, so the circles, the workout rows, the
 * day's dot and the checklist all agree on a tap. Ticks and tags go through lib/goals/optimistic.ts;
 * the workout rows' rules are lib/goals/rows.ts. This is the React around them.
 */
export function TodayLive({ view, actions, children }: { view: TodayView; actions: GoalActions; children: ReactNode }) {
  const [over, setOver] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<PendingWorkout[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [minutesOver, setMinutesOver] = useState<Record<string, number>>({});
  const viewRef = useRef(view);
  viewRef.current = view;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  /** Workouts whose Undo was tapped before their save returned: removed the moment their id is known. */
  const undone = useRef(new Set<string>());
  /** The real session id of each workout whose save has returned, by its local id. */
  const savedAs = useRef(new Map<string, string>());

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
        quiet(error ?? `${what ?? "That"} didn't save, so it's back as it was.`);
      },
    });
  }
  const flags = flagsRef.current;

  // When fresh data arrives, forget what the server now agrees with.
  useEffect(() => {
    const server: Record<string, boolean | undefined> = {};
    for (const r of view.rules) if (r.kind === "check_in") server[tickKey(view.today, r.key)] = r.state === "met";
    if (view.behind) for (const it of view.behind.items) if (it.kind === "check_in") server[tickKey(view.behind.day, it.key)] = false;
    for (const s of view.sessions) for (const m of view.marks) server[tagKey(s.id, m)] = s.tags.includes(m);
    setOver((o) => {
      const next = stillOverridden(o, server, (k) => flags.busy(k));
      return Object.keys(next).length === Object.keys(o).length ? o : next;
    });
    const ids = [...view.sessions, ...(view.behind?.workout?.sessions ?? [])].map((s) => s.id);
    setPending((p) => {
      const next = settlePending(p, ids);
      return next.length === p.length ? p : next;
    });
    // A removed workout is gone from the server's list once it has been removed; edited minutes are settled once the server shows them.
    setRemoved((r) => {
      const next = r.filter((id) => ids.includes(id));
      return next.length === r.length ? r : next;
    });
    setMinutesOver((o) => {
      const next = Object.fromEntries(Object.entries(o).filter(([id, m]) => view.sessions.find((s) => s.id === id)?.minutes !== m));
      return Object.keys(next).length === Object.keys(o).length ? o : next;
    });
  }, [view, flags]);

  const ticked = useCallback((key: string, state: string, day: string) => over[tickKey(day, key)] ?? state === "met", [over]);
  const toggleTick = useCallback((key: string, day: string, now: boolean) => flags.set(tickKey(day, key), !now, now), [flags]);
  const tagged = useCallback((sessionId: string, mark: string, had: boolean) => over[tagKey(sessionId, mark)] ?? had, [over]);
  const toggleTag = useCallback((sessionId: string, mark: string, now: boolean) => flags.set(tagKey(sessionId, mark), !now, now), [flags]);

  // ── Workouts ─────────────────────────────────────────────────────────────

  /** Take a saved workout off the card, then remove it. If that fails it comes back, with a note. */
  const takeOff = useCallback(
    async (sessionId: string, tempId: string | null) => {
      setRemoved((r) => [...r, sessionId]);
      const r = await actionsRef.current.removeWorkout({ goalId: viewRef.current.goalId, sessionId }).catch(() => ({ ok: false, error: undefined }) as SaveResult);
      if (r.ok) return;
      setRemoved((x) => x.filter((id) => id !== sessionId));
      if (tempId) {
        undone.current.delete(tempId);
        setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, undone: false } : x)));
      }
      quiet(r.error ?? "That didn't come off, so it's back as it was.");
    },
    []
  );

  const undo = useCallback(
    (tempId: string) => {
      undone.current.add(tempId);
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, undone: true } : x)));
      const sessionId = savedAs.current.get(tempId);
      if (sessionId) void takeOff(sessionId, tempId); // its save has returned: remove it now (otherwise the save's own handler does)
    },
    [takeOff]
  );

  const logWorkout = useCallback(
    (outdoors: boolean, which: "today" | "yesterday" = "today") => {
      const v = viewRef.current;
      const w = v.workout;
      const day = which === "yesterday" ? v.behind?.day : v.today;
      if (!w || !day) return;
      const tempId = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const minutes = w.defaultMinutes;
      setPending((p) => [...p, { tempId, day, minutes, outdoors, sessionId: null, undone: false }]);
      actionsRef.current
        .logWorkout({ goalId: v.goalId, minutes, outdoors, ...(which === "yesterday" ? { day } : {}) })
        .catch(() => ({ ok: false }) as LogResult)
        .then((r) => {
          if (!r.ok || !r.sessionId) {
            setPending((p) => p.filter((x) => x.tempId !== tempId));
            undone.current.delete(tempId);
            quiet(r.error ?? "That workout didn't save, so it's back as it was.");
            return;
          }
          const sessionId = r.sessionId;
          savedAs.current.set(tempId, sessionId);
          setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, sessionId } : x)));
          if (undone.current.has(tempId)) {
            void takeOff(sessionId, tempId); // Undo was tapped while it was saving
            return;
          }
          toast(`Workout logged${which === "yesterday" ? " for yesterday" : ""} · ${minutes} min`, { duration: 6000, action: { label: "Undo", onClick: () => undo(tempId) } });
        });
    },
    [takeOff, undo]
  );

  const editMinutes = useCallback((sessionId: string, minutes: number) => {
    setMinutesOver((o) => ({ ...o, [sessionId]: minutes }));
    actionsRef.current
      .setWorkoutMinutes({ goalId: viewRef.current.goalId, sessionId, minutes })
      .catch(() => ({ ok: false, error: undefined }) as SaveResult)
      .then((r) => {
        if (r.ok) return;
        setMinutesOver((o) => Object.fromEntries(Object.entries(o).filter(([id]) => id !== sessionId)));
        quiet(r.error ?? "The minutes didn't save, so they're back as they were.");
      });
  }, []);

  const removeRow = useCallback((sessionId: string) => void takeOff(sessionId, null), [takeOff]);

  const w = view.workout;
  const rows = useMemo(() => {
    if (!w) return { today: [], yesterday: [] };
    const yesterday = view.behind?.workout && view.behind.items.some((i) => i.kind === "sessions") ? view.behind : null;
    return {
      today: workoutRows({ need: w.need, sessions: view.sessions, mark: w.mark, pending: pending.filter((p) => p.day === view.today), removed, minutesOver }),
      yesterday: yesterday ? workoutRows({ need: w.need, sessions: yesterday.workout?.sessions ?? [], mark: w.mark, pending: pending.filter((p) => p.day === yesterday.day), removed, minutesOver }) : [],
    };
  }, [w, view, pending, removed, minutesOver]);

  const dayDone = useMemo(() => {
    const hasTag = (r: Extract<WorkoutRow, { kind: "workout" }>, mark: string) => (r.sessionId ? (over[tagKey(r.sessionId, mark)] ?? r.tags.includes(mark)) : r.tags.includes(mark));
    return view.rules.every((r) => {
      if (r.kind === "check_in") return over[tickKey(view.today, r.key)] ?? r.state === "met";
      if (!w) return r.state === "met";
      // A workout rule is met by the rows as they are now, or (if nothing has been taken off) by what the server already says.
      return rowsMeetRule({ need: r.need, mark: r.mark, minMinutes: r.minMinutes }, rows.today, hasTag) || (r.state === "met" && removed.length === 0 && Object.keys(minutesOver).length === 0);
    });
  }, [view, over, rows, w, removed, minutesOver]);

  const value = useMemo<Live>(
    () => ({ view, ticked, toggleTick, tagged, toggleTag, rows, logWorkout, editMinutes, removeRow, dayDone }),
    [view, ticked, toggleTick, tagged, toggleTag, rows, logWorkout, editMinutes, removeRow, dayDone]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
