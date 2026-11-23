"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { formatClock, parseClock, type BareUnit } from "@/lib/sessions/duration";

export type TargetValues = { sets: number; repMin: number; repMax: number; weight: number | null };

function Field({ label, value, onChange, step = 1, min = 1, max = 999, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; placeholder?: string }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.min(Math.max(Number(e.target.value), 0), max))}
        onFocus={(e) => e.target.select()}
        className="h-11 w-full rounded-lg border border-line-strong bg-dusk-raised px-3 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-mute focus:border-ink/40"
      />
    </label>
  );
}

/** A time as m:ss (stored as seconds): 15:00, 0:45. Typed 15 reads as minutes for steady cardio, seconds otherwise. */
function TimeField({ label, value, onChange, bare }: { label: string; value: number; onChange: (v: number) => void; bare: BareUnit }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? formatClock(value)}
        placeholder="0:00"
        onFocus={(e) => {
          setDraft(formatClock(value));
          e.target.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const secs = parseClock(e.target.value, bare);
          if (secs != null) onChange(secs);
        }}
        onBlur={() => setDraft(null)}
        className="h-11 w-full rounded-lg border border-line-strong bg-dusk-raised px-3 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-mute focus:border-ink/40"
      />
    </label>
  );
}

/** Edit the sets, rep range and target weight of one exercise in one workout. */
export function TargetEditor({
  initial,
  unit,
  loaded,
  bare = "sec",
  onSave,
  onCancel,
}: {
  initial: TargetValues;
  unit: "reps" | "secs";
  /** Bodyweight exercises have no weight to set. */
  loaded: boolean;
  /** What a typed bare number means for a timed exercise. */
  bare?: BareUnit;
  onSave: (values: TargetValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<TargetValues>(initial);
  const [saving, setSaving] = useState(false);
  const what = unit === "secs" ? "sec" : "reps";
  const valid = v.sets >= 1 && v.repMin >= 1 && v.repMax >= v.repMin;

  async function save() {
    setSaving(true);
    await onSave(v);
    setSaving(false);
  }

  return (
    <div className="fade-in rounded-xl border border-line bg-bone p-3">
      <div className="flex gap-2">
        <Field label="Sets" value={v.sets} max={10} onChange={(n) => setV({ ...v, sets: n ?? 0 })} />
        {unit === "secs" ? (
          <>
            <TimeField label="Min time" value={v.repMin} bare={bare} onChange={(n) => setV({ ...v, repMin: n })} />
            <TimeField label="Max time" value={v.repMax} bare={bare} onChange={(n) => setV({ ...v, repMax: n })} />
          </>
        ) : (
          <>
            <Field label={`Min ${what}`} value={v.repMin} max={600} onChange={(n) => setV({ ...v, repMin: n ?? 0 })} />
            <Field label={`Max ${what}`} value={v.repMax} max={600} onChange={(n) => setV({ ...v, repMax: n ?? 0 })} />
          </>
        )}
        {loaded && <Field label="Weight lb" value={v.weight} min={0} max={1000} step={5} placeholder="auto" onChange={(n) => setV({ ...v, weight: n && n > 0 ? n : null })} />}
      </div>
      {loaded && <p className="mt-2 text-xs text-ink-mute">Leave weight empty and Atlas works it out from your last session.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="press h-9 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!valid || saving} className="press flex h-9 items-center gap-1.5 rounded-lg bg-dusk-button px-4 text-sm font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-40">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save target
        </button>
      </div>
    </div>
  );
}
