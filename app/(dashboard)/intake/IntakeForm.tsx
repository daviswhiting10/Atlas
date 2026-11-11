"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveIntake } from "@/lib/actions/intake";
import { cn } from "@/lib/utils";

type Program = { id: string; name: string; weeks: number; category: string; tag: string | null };

const PLACEHOLDER = `A few sentences in your own words. Worth covering:
· What they want, and why now
· Training history: what they've done, what's worked
· Injuries, pain or anything to work around
· How many days a week, and what equipment they have
· Sleep, stress, work: anything that affects recovery`;

const field = "w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink outline-none focus:border-ink/40";

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
      <section>
        <label className="text-sm font-semibold text-ink" htmlFor="intake-client">
          Client
        </label>
        <select id="intake-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={cn(field, "mt-2 h-12")}>
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
        {clientId === "new" && (
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Their full name" maxLength={120} autoFocus className={cn(field, "mt-2 h-12")} />
        )}
      </section>

      <section>
        <p className="text-sm font-semibold text-ink">Goal</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Goal">
          {categories.map((c) => (
            <button
              key={c.tag}
              type="button"
              role="radio"
              aria-checked={tag === c.tag}
              onClick={() => setTag(c.tag)}
              className={cn(
                "press rounded-full border px-4 py-2 text-sm font-medium",
                tag === c.tag ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/25 hover:text-ink"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <label className="text-sm font-semibold text-ink" htmlFor="intake-notes">
          Notes
        </label>
        <textarea
          id="intake-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          maxLength={8000}
          placeholder={PLACEHOLDER}
          className={cn(field, "mt-2 resize-y py-3 leading-relaxed placeholder:text-ink-mute/80")}
        />
      </section>

      <section>
        <label className="text-sm font-semibold text-ink" htmlFor="intake-program">
          Program <span className="font-normal text-ink-mute">(optional)</span>
        </label>
        <select id="intake-program" value={programId} onChange={(e) => setProgramId(e.target.value)} className={cn(field, "mt-2 h-12")}>
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
      </section>

      <button type="submit" disabled={!ready || saving} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-40">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save intake"}
      </button>
    </form>
  );
}
