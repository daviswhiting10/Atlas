"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveIntake } from "@/lib/actions/intake";
import { cn } from "@/lib/utils";

type Program = { id: string; name: string; weeks: number; category: string; tag: string | null };

const PLACEHOLDER = "In your own words: what they want, and why now.";
const COVER = "Worth covering: training history · injuries or anything to work around · days a week and equipment · sleep, stress and work.";

const field = "w-full rounded-xl border border-line-strong bg-dusk-raised px-3.5 text-[15px] text-ink outline-none focus:border-ink/40";

/** A numbered step heading: the form reads as four short steps, not one long page. */
function Step({ n, title, children, hint }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="tnum flex h-6 w-6 items-center justify-center rounded-full bg-signal/15 text-[12px] font-bold text-signal">{n}</span>
        <h2 className="text-[17px] font-semibold text-ink">
          {title}
          {hint && <span className="ml-1.5 text-[14px] font-normal text-ink-mute">{hint}</span>}
        </h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function IntakeForm({
  clients,
  programs,
  categories,
  initialClientId,
}: {
  clients: Array<{ id: string; fullName: string }>;
  programs: Program[];
  categories: Array<{ tag: string; label: string }>;
  initialClientId: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId || (clients.length === 0 ? "new" : ""));
  const [newName, setNewName] = useState("");
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");
  const [programId, setProgramId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [saving, setSaving] = useState(false);

  // Programs in the chosen category first, then the rest of the library.
  const ordered = [...programs].sort((a, b) => Number(b.tag === tag) - Number(a.tag === tag) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const groups = Array.from(new Set(ordered.map((p) => p.category)));
  const ready = Boolean(clientId && (clientId !== "new" || newName.trim()) && tag);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    const res = await saveIntake({
      ...(clientId === "new" ? { newClientName: newName.trim() } : { clientId }),
      tag,
      notes,
      ...(programId ? { programId, startDate } : {}),
    });
    if (!res.ok) {
      setSaving(false);
      toast.error(res.error);
      return;
    }
    toast.success("Intake saved");
    router.push(`/clients/${res.clientId}`);
  }

  return (
    <form onSubmit={submit} className="rise rise-1 space-y-7">
      <Step n={1} title="Who is it for?">
        {clients.length <= 12 ? (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Client">
            {[...clients.map((c) => ({ id: c.id, label: c.fullName })), { id: "new", label: "+ New client" }].map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={clientId === c.id}
                onClick={() => setClientId(c.id)}
                className={cn("press min-h-11 rounded-full border px-4 text-[15px] font-medium", clientId === c.id ? "border-ink bg-dusk-selected text-dusk-selected-text" : "border-line bg-paper text-ink-soft hover:border-ink/25 hover:text-ink")}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <select id="intake-client" aria-label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={cn(field, "h-12")}>
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
            <option value="new">+ New client</option>
          </select>
        )}
        {clientId === "new" && <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Their full name" maxLength={120} autoFocus className={cn(field, "mt-3 h-12")} />}
      </Step>

      <Step n={2} title="What is the goal?">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Goal">
          {categories.map((c) => (
            <button
              key={c.tag}
              type="button"
              role="radio"
              aria-checked={tag === c.tag}
              onClick={() => setTag(c.tag)}
              className={cn(
                "press rounded-full border px-4 py-2 text-sm font-medium",
                tag === c.tag ? "border-ink bg-dusk-selected text-dusk-selected-text" : "border-line bg-paper text-ink-soft hover:border-ink/25 hover:text-ink"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Step>

      <Step n={3} title="What did you learn?" hint="(optional)">
        <label className="sr-only" htmlFor="intake-notes">
          Notes
        </label>
        <textarea
          id="intake-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={8000}
          placeholder={PLACEHOLDER}
          className={cn(field, "resize-y py-3 leading-relaxed placeholder:text-ink-mute")}
        />
        <p className="mt-2 text-[13px] leading-snug text-ink-mute">{COVER}</p>
      </Step>

      <Step n={4} title="Give them a program" hint="(optional)">
        <select id="intake-program" aria-label="Program" value={programId} onChange={(e) => setProgramId(e.target.value)} className={cn(field, "h-12")}>
          <option value="">No program yet</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {ordered
                .filter((p) => p.category === g)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.weeks} wk
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {programId && (
          <>
            <label className="mt-2 flex items-center gap-3 text-sm text-ink-soft">
              Starts
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={cn(field, "h-10 w-auto")} />
            </label>
            <p className="mt-1.5 text-xs text-ink-mute">It becomes their live plan. Any plan they&apos;re on now is finished; their logged history stays.</p>
          </>
        )}
      </Step>

      <button type="submit" disabled={!ready || saving} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-dusk-button text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-40">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : ready ? "Save intake" : !clientId ? "Choose who it is for" : clientId === "new" && !newName.trim() ? "Add their name" : "Choose a goal"}
      </button>
    </form>
  );
}
