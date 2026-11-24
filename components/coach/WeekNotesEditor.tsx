"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pin } from "lucide-react";
import { toast } from "sonner";
import { MAX_WEEK_NOTE, type WeekNote } from "@/lib/plan/week-notes";

type Save = (raw: { week: number; title?: string; text: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * The coach's week notes for a plan: one note per week, shown to the client on Today (the current week's) and on
 * Plan (that one and the weeks to come). Pick a week, write the note, Save; an empty note clears that week.
 */
export function WeekNotesEditor({ notes, totalWeeks, currentWeek, firstName, save }: { notes: WeekNote[]; totalWeeks: number; currentWeek: number; firstName: string; save: Save }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [week, setWeek] = useState(Math.min(currentWeek, totalWeeks));
  const existing = notes.find((n) => n.week === week);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [text, setText] = useState(existing?.text ?? "");

  const pick = (w: number) => {
    setWeek(w);
    const n = notes.find((x) => x.week === w);
    setTitle(n?.title ?? "");
    setText(n?.text ?? "");
  };
  const submit = () =>
    start(async () => {
      const r = await save({ week, title: title.trim() || undefined, text });
      if (!r.ok) return void toast.error(r.error);
      toast.success(text.trim() ? `Week ${week} note saved` : `Week ${week} note cleared`);
      router.refresh();
    });

  return (
    <section className="surface p-5" aria-label="Week notes">
      <p className="eyebrow flex items-center gap-1.5">
        <Pin className="h-3.5 w-3.5" /> Week notes · {firstName} sees these on Today and Plan
      </p>
      {notes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {notes.map((n) => (
            <li key={n.week}>
              <button type="button" onClick={() => pick(n.week)} className={`press min-h-11 rounded-full border px-3 text-[13px] font-medium ${n.week === week ? "border-ink/40 text-ink" : "border-line text-ink-soft"}`}>
                Week {n.week}
                {n.title ? ` · ${n.title}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <label className="block">
          <span className="eyebrow">Week</span>
          <select value={week} onChange={(e) => pick(Number(e.target.value))} className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-dusk-raised px-3 text-[15px] text-ink">
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Week {w}
                {w === currentWeek ? " (now)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">Title (optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Deload week" className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-dusk-raised px-3 text-[15px] text-ink" />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="eyebrow">Note</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_WEEK_NOTE} rows={3} placeholder="Same weights, half the sets." className="mt-1.5 w-full rounded-lg border border-line-strong bg-dusk-raised px-3 py-2.5 text-[15px] text-ink" />
      </label>
      <button type="button" onClick={submit} disabled={pending || (!text.trim() && !existing)} className="press mt-3 flex h-11 items-center gap-2 rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text disabled:opacity-50">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {text.trim() ? `Save week ${week} note` : `Clear week ${week} note`}
      </button>
    </section>
  );
}
