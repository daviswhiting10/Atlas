"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addBodyWeight } from "@/lib/actions/body-weight";

/** "Add body weight": one number in pounds, saved for today. Opens from the Me ⋯ menu. */
export function BodyWeightSheet({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const lb = Number(value.replace(",", "."));
  const save = () =>
    start(async () => {
      const r = await addBodyWeight({ lb });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${Math.round(lb * 10) / 10} lb added`);
      onClose();
      router.refresh();
    });
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 sm:items-center" onClick={() => !pending && onClose()}>
      <form
        className="sheet-up w-full max-w-md rounded-t-[28px] bg-bone p-5 sm:rounded-[28px]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Add body weight"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() && !pending) save();
        }}
      >
        <h2 className="font-display text-3xl text-ink">Body weight</h2>
        <label className="mt-4 flex items-center gap-3">
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="182.4"
            aria-label="Body weight in pounds"
            className="tnum h-14 w-full rounded-2xl border border-line-strong bg-paper px-4 text-[24px] text-ink outline-none focus:border-ink/40"
          />
          <span className="text-[17px] font-medium text-ink-soft">lb</span>
        </label>
        <p className="mt-2 text-[13px] text-ink-mute">Saved for today. It shows on Progress.</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} disabled={pending} className="press h-14 flex-1 rounded-2xl border border-line-strong text-[17px] font-semibold text-ink">
            Cancel
          </button>
          <button type="submit" disabled={pending || !value.trim() || !Number.isFinite(lb)} className="press flex h-14 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text disabled:opacity-50">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </form>
    </div>
  );
}
