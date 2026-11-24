"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { logCardio } from "@/lib/actions/athlete";
import { cn } from "@/lib/utils";

/** What can be logged. A swim is "other" cardio that is named Swim. */
export const QUICK_TYPES = [
  { id: "WALK", activity: "WALK", label: "Walk" },
  { id: "RUN", activity: "RUN", label: "Run" },
  { id: "SWIM", activity: "OTHER", label: "Swim" },
  { id: "OTHER", activity: "OTHER", label: "Cardio" },
] as const;
export type QuickKind = (typeof QUICK_TYPES)[number]["id"];
const TYPES = QUICK_TYPES;
type Kind = QuickKind;
const CHIPS = [20, 30, 45];
const KEY = "atlas.quickcardio.type";

/**
 * Log cardio or a walk in two taps: a minutes chip, then Save. The type starts as the one used last; the minutes can also
 * be typed; the distance is optional. It counts today.
 */
export function QuickCardioSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; /** Open on this type (from the Log button); otherwise on the one used last. */ initial?: QuickKind }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("OTHER");
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      const k = window.localStorage.getItem(KEY);
      if (!initial && (k === "WALK" || k === "RUN" || k === "SWIM" || k === "OTHER")) setKind(k);
    } catch {
      // Private mode: the type just starts as Cardio.
    }
  }, [initial]);

  // Opened for a type from the Log button: that type.
  useEffect(() => {
    if (open && initial) setKind(initial);
  }, [open, initial]);
  const chosen = QUICK_TYPES.find((t) => t.id === kind)!;

  const m = Number(minutes);
  const minutesOk = /^\d{1,3}$/.test(minutes.trim()) && m >= 1 && m <= 600;
  const distanceOk = distance.trim() === "" || (Number.isFinite(Number(distance)) && Number(distance) >= 0 && Number(distance) <= 500);

  const save = () =>
    start(async () => {
      const r = await logCardio({ activity: chosen.activity, ...(kind === "SWIM" ? { label: "Swim" } : {}), minutes: m, distance: distance.trim() === "" ? null : Number(distance), unit: "mi" }).catch(() => ({ ok: false as const, error: "Couldn't save that." }));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      try {
        window.localStorage.setItem(KEY, kind);
      } catch {
        // Not remembered; fine.
      }
      toast.success("Logged");
      setMinutes("");
      setDistance("");
      onClose();
      router.refresh();
    });

  const field = "h-12 w-full rounded-xl border border-line-strong bg-paper px-3.5 text-[16px] text-ink placeholder:text-ink-mute";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="!top-auto !bottom-0 !left-0 !max-h-[92vh] !max-w-none !translate-x-0 !translate-y-0 !overflow-y-auto !rounded-b-none px-4 pt-4 sm:!bottom-auto sm:!left-1/2 sm:!top-1/2 sm:!max-w-sm sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-b-[18px]"
        style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="font-body text-[22px] font-semibold tracking-[-0.02em]">Log {chosen.label.toLowerCase()}</DialogTitle>
          <button type="button" onClick={onClose} disabled={pending} className="press -mr-2 flex h-11 items-center px-3 text-[15px] font-medium text-ink-soft">
            Close
          </button>
        </div>
        <DialogDescription className="sr-only">Pick cardio or walk, the minutes, and optionally how far. It counts today.</DialogDescription>

        <div role="group" aria-label="Type" className="mt-2 grid grid-cols-4 rounded-2xl bg-ink/[0.06] p-1">
          {TYPES.map((t) => (
            <button key={t.id} type="button" aria-pressed={kind === t.id} onClick={() => setKind(t.id)} className={cn("press h-12 rounded-xl text-[15px] font-semibold", kind === t.id ? "bg-dusk-selected text-dusk-selected-text" : "text-ink-soft")}>
              {t.label}
            </button>
          ))}
        </div>

        <p className="mt-4 mb-1.5 flex justify-between text-[13px] text-ink-mute">
          <span>Minutes</span>
          <span>tap one, or type</span>
        </p>
        <input aria-label="Minutes" inputMode="numeric" placeholder="0" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))} className={cn(field, "h-16 text-center text-[32px] font-semibold tracking-[-0.02em]")} />
        <div className="mt-2.5 flex gap-2">
          {CHIPS.map((c) => (
            <button key={c} type="button" aria-pressed={minutes === String(c)} onClick={() => setMinutes(String(c))} className={cn("press h-11 flex-1 rounded-xl border text-[15px] font-semibold", minutes === String(c) ? "border-signal bg-signal/15 text-signal" : "border-line-strong")}>
              {c}
            </button>
          ))}
        </div>

        <p className="mt-4 mb-1.5 flex justify-between text-[13px] text-ink-mute">
          <span>Distance</span>
          <span>optional</span>
        </p>
        <div className="relative">
          <input aria-label="Distance in miles" inputMode="decimal" placeholder="Add a distance" value={distance} onChange={(e) => setDistance(e.target.value)} className={cn(field, "pr-12")} />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-ink-mute">mi</span>
        </div>

        <button type="button" disabled={pending || !minutesOk || !distanceOk} onClick={save} className="press mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <p className="mt-3 text-center text-[13px] text-ink-mute">Counts today. The type starts as the one you used last.</p>
      </DialogContent>
    </Dialog>
  );
}
