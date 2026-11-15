"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { setSessionDuration, tagSession, tickRule } from "@/lib/actions/goals";
import type { TodayView } from "@/lib/goals/today";

type Done = { ok: boolean; error?: string };

/** The day's checklist. Ticks respond at once and are put back if the save fails. */
export function GoalChecklist({ view }: { view: TodayView }) {
  const [, startTransition] = useTransition();
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [tags, setTags] = useState<Record<string, boolean>>({});
  const [minutes, setMinutes] = useState<Record<string, string>>({});

  const run = (call: () => Promise<Done>, undo: () => void) =>
    startTransition(async () => {
      const r = await call().catch(() => ({ ok: false, error: "Couldn't save that." }));
      if (!r.ok) {
        undo();
        toast.error(r.error ?? "Couldn't save that.");
      }
    });

  const ticked = (key: string, state: string, day: string) => ticks[`${day}|${key}`] ?? state === "met";
  const toggle = (key: string, day: string, now: boolean) => {
    setTicks((t) => ({ ...t, [`${day}|${key}`]: !now }));
    run(() => tickRule({ goalId: view.goalId, ruleKey: key, day, on: !now }), () => setTicks((t) => ({ ...t, [`${day}|${key}`]: now })));
  };
  const hasTag = (sessionId: string, mark: string, had: boolean) => tags[`${sessionId}|${mark}`] ?? had;
  const toggleTag = (sessionId: string, mark: string, now: boolean) => {
    setTags((t) => ({ ...t, [`${sessionId}|${mark}`]: !now }));
    run(() => tagSession({ goalId: view.goalId, sessionId, mark, on: !now }), () => setTags((t) => ({ ...t, [`${sessionId}|${mark}`]: now })));
  };
  const saveMinutes = (sessionId: string) => {
    const n = Math.round(Number(minutes[sessionId]));
    if (!Number.isFinite(n) || n < 1 || n > 600) return toast.error("Enter the minutes, 1 to 600.");
    run(() => setSessionDuration({ goalId: view.goalId, sessionId, minutes: n }), () => undefined);
  };

  const Circle = ({ on, state }: { on: boolean; state?: string }) => (
    <span className="dusk-check" data-state={on ? "on" : state === "needs_duration" ? "needs" : "off"}>
      <Check className="h-4 w-4" strokeWidth={2.5} />
    </span>
  );

  return (
    <div>
      {view.behind && (
        <div className="dusk-panel mb-4 text-[14px] text-dusk-soft">
          <p className="flex items-center gap-2 font-medium text-dusk-text">
            <span className="h-1.5 w-1.5 rounded-full bg-dusk-peach" aria-hidden /> Yesterday is still open
          </p>
          <ul className="mt-1">
            {view.behind.items.map((it) =>
              it.kind === "check_in" ? (
                <li key={it.key}>
                  <button type="button" onClick={() => toggle(it.key, view.behind!.day, ticked(it.key, "open", view.behind!.day))} className="flex min-h-[44px] w-full items-center gap-3 text-left">
                    <Circle on={ticked(it.key, "open", view.behind!.day)} />
                    <span>{it.label}</span>
                  </button>
                </li>
              ) : (
                <li key={it.key} className="flex min-h-[44px] items-center gap-3">
                  <span className="h-8 w-8 shrink-0" /> <span>{it.label}: log it for yesterday.</span>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-dusk-line">
        {view.rules.map((r) => {
          if (r.kind === "check_in") {
            const on = ticked(r.key, r.state, view.today);
            return (
              <li key={r.key}>
                <button type="button" onClick={() => toggle(r.key, view.today, on)} className="flex min-h-[56px] w-full items-center gap-3 py-3 text-left">
                  <Circle on={on} />
                  <span className="text-[15px] font-medium text-dusk-text">{r.label}</span>
                </button>
              </li>
            );
          }
          const met = r.state === "met";
          return (
            <li key={r.key} className="py-3">
              <div className="flex items-center gap-3">
                <Circle on={met} state={r.state} />
                <span className="min-w-0 flex-1 text-[15px] font-medium text-dusk-text">{r.label}</span>
                <span className="text-[13px] tabular-nums text-dusk-mute">
                  {r.have} of {r.need}
                </span>
              </div>
              {r.mark && (
                <div className="ml-11 mt-2 flex flex-wrap gap-2">
                  {view.sessions.length === 0 && <span className="text-[13px] text-ink-mute">Log a workout, then mark the one that was outdoors.</span>}
                  {view.sessions.map((s) => {
                    const on = hasTag(s.id, r.mark!, s.tags.includes(r.mark!));
                    return (
                      <button key={s.id} type="button" aria-pressed={on} onClick={() => toggleTag(s.id, r.mark!, on)} className="dusk-chip">
                        {s.title} · {on ? "Outdoors" : "Outdoors?"}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {view.needsDuration.length > 0 && (
        <div className="dusk-panel mt-3 space-y-3">
          {view.needsDuration.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 text-[14px] text-dusk-text">
              <span className="font-medium">{s.title} · how long?</span>
              <input inputMode="numeric" aria-label={`Minutes for ${s.title}`} value={minutes[s.id] ?? ""} onChange={(e) => setMinutes((m) => ({ ...m, [s.id]: e.target.value.replace(/\D/g, "") }))} className="dusk-input w-20 text-center tabular-nums" />
              <span className="text-ink-mute">min</span>
              <button type="button" onClick={() => saveMinutes(s.id)} className="dusk-button">
                Save
              </button>
            </div>
          ))}
        </div>
      )}

      <Link href="/workouts/new" className="dusk-button mt-5 w-full sm:w-auto">
        <Plus className="h-4 w-4" /> Log a workout
      </Link>
    </div>
  );
}
