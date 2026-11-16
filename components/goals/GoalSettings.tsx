"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { GoalActions } from "./TodayLive";

/**
 * The closed area's two things, for a goal kept to its challenge's own rules: what the diet says (the one
 * thing a person writes) and ending the goal. There is no way to add, drop or loosen a rule.
 */
export function GoalSettings({ goalId, diet, actions }: { goalId: string; diet: string | null; actions: Pick<GoalActions, "setDiet" | "endGoal"> }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(diet ?? "");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const act = (call: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    startTransition(async () => {
      const r = await call().catch(() => ({ ok: false, error: "Couldn't save that." }));
      if (!r.ok) toast.error(r.error ?? "Couldn't save that.");
      else done?.();
    });

  return (
    <div>
      {diet != null && (
        <div className="min-h-[48px] py-1">
          {editing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => actions.setDiet({ goalId, diet: draft }), () => setEditing(false));
              }}
            >
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} aria-label="Diet" placeholder="What your diet is" className="dusk-input min-w-0 flex-1 text-[15px]" />
              <button type="submit" disabled={pending} className="dusk-button !px-4">
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(diet);
                }}
                className="dusk-chip is-quiet"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[15px] leading-snug text-dusk-soft">{diet}</p>
              <button
                type="button"
                onClick={() => {
                  setDraft(diet);
                  setEditing(true);
                }}
                className="dusk-chip is-quiet -mr-2 shrink-0"
              >
                Edit diet
              </button>
            </div>
          )}
        </div>
      )}

      <div className={diet != null ? "mt-4 border-t border-dusk-line pt-3" : ""}>
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
