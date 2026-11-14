"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { startGoal } from "@/lib/actions/goals";
import { addDays } from "@/lib/goals/days";
import { previewStart } from "@/lib/goals/preview";

type Template = { key: string; name: string; blurb: string; length: number; rules: Array<{ key: string; label: string }> };

/** Pick the rules, say when it started, see the day number, then start. */
export function StartGoalForm({ template, today }: { template: Template; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startDay, setStartDay] = useState(today);
  const [dropped, setDropped] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const preview = previewStart(startDay, today, template.length);
  const kept = template.rules.filter((r) => !dropped.includes(r.key));
  const canStart = preview.ok && kept.length + added.length > 0 && !pending;

  const addRule = () => {
    const label = draft.replace(/\s+/g, " ").trim();
    if (label && !added.includes(label) && added.length < 10) setAdded([...added, label]);
    setDraft("");
  };

  const start = () =>
    startTransition(async () => {
      const r = await startGoal({ templateKey: template.key, startDay, drop: dropped, add: added }).catch(() => ({ ok: false as const, error: "Couldn't start it." }));
      if (!r.ok) return void toast.error(r.error);
      router.push("/today");
    });

  return (
    <div className="surface p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-3xl text-ink">{template.name}</h2>
        <span className="text-sm text-ink-mute">{template.length} days</span>
      </div>
      <p className="mt-1 text-[15px] text-ink-soft">{template.blurb}</p>

      <p className="eyebrow mt-6">Every day</p>
      <ul className="mt-2 divide-y divide-line">
        {template.rules.map((r) => {
          const on = !dropped.includes(r.key);
          return (
            <li key={r.key}>
              <button type="button" onClick={() => setDropped(on ? [...dropped, r.key] : dropped.filter((k) => k !== r.key))} className="press flex w-full items-center gap-3 py-3 text-left" aria-pressed={on}>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-md border text-[13px]", on ? "border-signal bg-signal text-white" : "border-ink/25 text-transparent")}>✓</span>
                <span className={cn("text-[15px]", on ? "font-semibold text-ink" : "text-ink-mute line-through")}>{r.label}</span>
              </button>
            </li>
          );
        })}
        {added.map((label) => (
          <li key={label} className="flex items-center gap-3 py-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-signal bg-signal text-[13px] text-white">✓</span>
            <span className="flex-1 text-[15px] font-semibold text-ink">{label}</span>
            <button type="button" aria-label={`Remove ${label}`} onClick={() => setAdded(added.filter((a) => a !== label))} className="press text-ink-mute hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addRule();
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} placeholder="Add a rule, like “No alcohol”" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-[15px]" />
        <button type="submit" className="press flex h-11 items-center gap-1 rounded-xl border border-line px-3 text-[14px] font-medium text-ink-soft hover:border-ink/25">
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      <label className="eyebrow mt-6 block" htmlFor="start-day">
        Start day
      </label>
      <input id="start-day" type="date" value={startDay} max={today} onChange={(e) => setStartDay(e.target.value)} className="mt-2 h-11 rounded-xl border border-line bg-white px-3 text-[15px]" />

      <div className="mt-5 rounded-xl bg-ink/[0.04] px-4 py-3.5" aria-live="polite">
        {preview.ok ? (
          <>
            <p className="text-[17px] font-semibold text-ink">
              Today is Day {preview.dayOfGoal} of {template.length}
            </p>
            {preview.carriedDays > 0 ? (
              <p className="mt-1 text-[14px] text-ink-soft">
                {preview.carriedDays} day{preview.carriedDays === 1 ? "" : "s"}, {format(parseISO(startDay), "MMM d")} through {format(parseISO(addDays(today, -1)), "MMM d")}, happened before Atlas. They count as done and show as “before Atlas”. From today, workouts and ticks are checked for real.
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-ink-soft">Starting today. Workouts and ticks are checked from now on.</p>
            )}
          </>
        ) : (
          <p className="text-[14px] text-ink-soft">{preview.error}</p>
        )}
      </div>

      <button type="button" disabled={!canStart} onClick={start} className="press mt-5 h-14 w-full rounded-xl bg-ink text-base font-semibold text-white disabled:bg-ink/25">
        {pending ? "Starting…" : preview.ok ? `Start ${template.name} at day ${preview.dayOfGoal}` : `Start ${template.name}`}
      </button>
    </div>
  );
}
