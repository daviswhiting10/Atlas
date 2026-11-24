"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Save = (raw: { assignedWorkoutId: string; text: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Session complete: the athlete's own note on the session ("Felt strong, left knee a bit sore"). Their coach sees it,
 * labelled as theirs, next to the coach's own note. Optional; saving an empty note removes it.
 */
export function MySessionNote({ assignedWorkoutId, initial, save }: { assignedWorkoutId: string; initial: string | null | undefined; save: Save }) {
  const [text, setText] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [pending, start] = useTransition();
  const dirty = text.trim() !== saved.trim();
  const submit = () =>
    start(async () => {
      const r = await save({ assignedWorkoutId, text });
      if (!r.ok) return void toast.error(r.error);
      setSaved(text);
      toast.success(text.trim() ? "Note saved" : "Note removed");
    });
  return (
    <section className="mt-10 text-left" aria-label="Your notes">
      <label className="block">
        <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Your notes</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="How did it go? Anything your coach should know?"
          className="mt-2 w-full rounded-2xl border border-line-strong bg-paper px-4 py-3 text-[16px] leading-relaxed text-ink outline-none focus:border-ink/40"
        />
      </label>
      {(dirty || pending) && (
        <button type="button" onClick={submit} disabled={pending} className="press mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line-strong text-[15px] font-semibold text-ink">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save note
        </button>
      )}
    </section>
  );
}
