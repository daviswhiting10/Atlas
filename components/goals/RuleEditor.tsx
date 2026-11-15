"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { GoalActions } from "./TodayLive";

type Item = { key: string; label: string; removable: boolean };

/** Add or stop counting a rule on a running goal, and end it. Added rules count from today; stopped ones stop tomorrow. */
export function RuleEditor({ goalId, items, actions }: { goalId: string; items: Item[]; actions: Pick<GoalActions, "addGoalRule" | "removeGoalRule" | "endGoal"> }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const act = (call: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    startTransition(async () => {
      const r = await call().catch(() => ({ ok: false, error: "Couldn't save that." }));
      if (!r.ok) toast.error(r.error ?? "Couldn't save that.");
      else done?.();
    });

  return (
    <div>
      <ul className="divide-y divide-dusk-line">
        {items.map((it) => (
          <li key={it.key} className="flex min-h-[48px] items-center gap-3 py-1">
            <span className="min-w-0 flex-1 text-[15px] font-medium text-dusk-text">{it.label}</span>
            {it.removable && (
              <button type="button" disabled={pending} onClick={() => act(() => actions.removeGoalRule({ goalId, key: it.key }))} className="dusk-chip is-quiet -mr-2 shrink-0 text-[13px]">
                Stop counting
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const label = draft.trim();
          if (label) act(() => actions.addGoalRule({ goalId, label }), () => setDraft(""));
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} placeholder="New rule, from today" aria-label="Add a rule" className="dusk-input min-w-0 flex-1 text-[15px]" />
        <button type="submit" disabled={pending || !draft.trim()} className="dusk-chip shrink-0">
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      <div className="mt-6 border-t border-dusk-line pt-3">
        {confirmEnd ? (
          <div className="dusk-panel">
            <p className="text-[15px] font-medium text-dusk-text">End this goal?</p>
            <p className="mt-1 text-[14px] leading-relaxed text-dusk-soft">It becomes a chapter. Your workouts stay as they are, and you can start it again later.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => act(() => actions.endGoal({ goalId }))} className="dusk-button">
                End it
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} className="dusk-chip">
                Keep going
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmEnd(true)} className="dusk-chip is-quiet -ml-2">
            End this goal
          </button>
        )}
      </div>
    </div>
  );
}
