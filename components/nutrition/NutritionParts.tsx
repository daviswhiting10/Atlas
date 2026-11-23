"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { deleteFood, saveTargets } from "@/lib/actions/nutrition";
import { parseTarget } from "@/lib/nutrition/calc";
import { LogFoodSheet } from "./LogFoodSheet";

/** Today's Nutrition row: intake against the target, one tap to log. The whole row is one button. */
export function TodayNutritionRow({ calories, target, proteinG, proteinTarget, uncounted }: { calories: number; target: number | null; proteinG: number; proteinTarget: number | null; uncounted: number }) {
  const [open, setOpen] = useState(false);
  const pct = target ? Math.min(100, Math.round((calories / target) * 100)) : 0;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="press block w-full rounded-[22px] border border-line bg-paper p-4 text-left">
        <span className="flex items-center justify-between">
          <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Nutrition · today</span>
          <span className="flex h-9 items-center gap-1 rounded-full bg-dusk-button px-3.5 text-[14px] font-semibold text-dusk-button-text">
            <Plus className="h-4 w-4" /> Log food
          </span>
        </span>
        <span className="mt-2.5 block text-[28px] font-semibold tracking-[-0.02em] text-ink">
          {calories.toLocaleString()} <span className="text-[15px] font-medium tracking-normal text-ink-mute">{target ? `of ${target.toLocaleString()} kcal` : "kcal logged"}</span>
        </span>
        {target ? (
          <span className="mt-3 block h-2 overflow-hidden rounded-full bg-ink/15" role="progressbar" aria-label="Calories" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(calories, target)}>
            <span className="block h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
          </span>
        ) : null}
        <span className="mt-2 flex justify-between text-[13px] text-ink-mute">
          <span>{proteinTarget ? `Protein ${proteinG} / ${proteinTarget} g` : `Protein ${proteinG} g`}</span>
          <span>{uncounted > 0 ? `${uncounted} without calories` : target ? (calories <= target ? `${(target - calories).toLocaleString()} kcal left` : `${(calories - target).toLocaleString()} over`) : "Set targets in You"}</span>
        </span>
      </button>
      <LogFoodSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** The "Log food" button on the Nutrition tab. */
export function LogFoodButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="press flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text">
        Log food
      </button>
      <LogFoodSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Daily targets: four optional whole numbers. Empty means no target for that number. */
export function TargetsEditor({ initial }: { initial: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null } }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ calories: initial.calories?.toString() ?? "", proteinG: initial.proteinG?.toString() ?? "", carbsG: initial.carbsG?.toString() ?? "", fatG: initial.fatG?.toString() ?? "" });
  const [pending, start] = useTransition();
  const rows: Array<[keyof typeof v, string, string, number]> = [["calories", "Calories", "kcal", 10000], ["proteinG", "Protein", "g", 1000], ["carbsG", "Carbs", "g", 2000], ["fatG", "Fat", "g", 1000]];
  const save = () => {
    const out: Record<string, number | null> = {};
    for (const [k, label, , max] of rows) {
      const p = parseTarget(v[k], max);
      if (!p.ok) return toast.error(`${label}: a whole number up to ${max.toLocaleString()}, or empty.`);
      out[k] = p.value;
    }
    start(async () => {
      const r = await saveTargets(out).catch(() => ({ ok: false as const, error: "Couldn't save that." }));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setEditing(false);
    });
  };
  return (
    <div className="rounded-[22px] border border-line bg-paper p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Daily targets</p>
        <button type="button" onClick={editing ? save : () => setEditing(true)} disabled={pending} className="press h-9 rounded-full border border-line-strong px-4 text-[14px] font-semibold disabled:opacity-60">
          {editing ? "Save" : "Edit"}
        </button>
      </div>
      <div className="mt-2">
        {rows.map(([k, label, unit]) => (
          <div key={k} className="flex min-h-11 items-center justify-between border-t border-line text-[16px] first:border-t-0">
            <b className="font-semibold">{label}</b>
            {editing ? (
              <span className="flex items-center gap-1.5">
                <input aria-label={label} inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder="none" className="h-9 w-24 rounded-lg border border-line-strong bg-paper px-2 text-right text-[15px]" />
                <span className="text-[14px] text-ink-mute">{unit}</span>
              </span>
            ) : (
              <span className="text-[15px] text-ink-mute">{v[k] ? `${Number(v[k]).toLocaleString()} ${unit}` : "No target"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Remove one entry (a small, quiet text button on its row). */
export function DeleteEntry({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() => start(async () => { const r = await deleteFood({ id }).catch(() => ({ ok: false as const, error: "Couldn't remove it." })); if (!r.ok) toast.error(r.error); })}
      className="press -mr-2 flex h-11 shrink-0 items-center px-3 text-[14px] font-medium text-ink-mute disabled:opacity-60"
    >
      Remove
    </button>
  );
}
