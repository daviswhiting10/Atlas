"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addGoalRule, endGoal, removeGoalRule } from "@/lib/actions/goals";

type Item = { key: string; label: string; detail: string; removable: boolean };

/** Add or remove a rule on a running goal, and end it. Added rules count from today; removed ones stop tomorrow. */
export function RuleEditor({ goalId, items }: { goalId: string; items: Item[] }) {
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
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">{it.label}</span>
              <span className="block text-[13px] text-ink-mute">{it.detail}</span>
            </span>
            {it.removable && (
              <button type="button" disabled={pending} onClick={() => act(() => removeGoalRule({ goalId, key: it.key }))} className="press text-[13px] font-medium text-ink-mute hover:text-ink">
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
          if (label) act(() => addGoalRule({ goalId, label }), () => setDraft(""));
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} placeholder="Add a rule, counted from today" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-[15px]" />
        <button type="submit" disabled={pending || !draft.trim()} className="press flex h-11 items-center gap-1 rounded-xl border border-line px-3 text-[14px] font-medium text-ink-soft hover:border-ink/25 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      <div className="mt-8 border-t border-line pt-5">
        {confirmEnd ? (
          <div className="rounded-xl bg-ink/[0.04] p-4">
            <p className="text-[15px] font-semibold text-ink">End this goal?</p>
            <p className="mt-1 text-[14px] text-ink-soft">It becomes a chapter. Your workouts stay as they are, and you can start it again later.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={pending} onClick={() => act(() => endGoal({ goalId }))} className="press h-11 rounded-xl bg-ink px-5 text-[14px] font-semibold text-white">
                End it
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} className="press h-11 rounded-xl border border-line px-5 text-[14px] font-medium text-ink-soft">
                Keep going
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmEnd(true)} className="press text-[14px] font-medium text-ink-mute hover:text-ink">
            End this goal
          </button>
        )}
      </div>
    </div>
  );
}
