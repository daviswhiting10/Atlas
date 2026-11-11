"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { startMyProgram } from "@/lib/actions/athlete";
import { cn } from "@/lib/utils";

export type LibraryProgram = { id: string; name: string; weeks: number; category: string };

/**
 * My training: run one of your own library programs, exactly as written,
 * or import a new one from photos of a written plan.
 */
export function OwnProgramPicker({ programs, hasPlan = false, className }: { programs: LibraryProgram[]; hasPlan?: boolean; className?: string }) {
  const router = useRouter();
  const [programId, setProgramId] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false);
  const groups = Array.from(new Set(programs.map((p) => p.category)));

  async function start() {
    if (!programId) return;
    setBusy(true);
    const res = await startMyProgram({ programId, startDate: date });
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    toast.success("Program started");
    router.push("/today");
    router.refresh();
  }

  const field = "h-12 rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink outline-none focus:border-ink/40";

  return (
    <div className={cn("space-y-3", className)}>
      {programs.length > 0 ? (
        <>
          <select aria-label="Your programs" value={programId} onChange={(e) => setProgramId(e.target.value)} className={cn(field, "w-full")}>
            <option value="">{hasPlan ? "Switch to one of my programs" : "Choose one of my programs"}</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {programs
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-3 text-sm text-ink-soft">
                Starts
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(field, "h-11")} />
              </label>
              <button type="button" onClick={start} disabled={busy} className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start this program"}
              </button>
            </div>
          )}
          {programId && hasPlan && <p className="text-xs text-ink-mute">Your current plan is finished when this one starts; your logged history stays.</p>}
        </>
      ) : (
        <p className="text-[14px] text-ink-soft">Your library is empty. Import a program you&apos;ve written and it&apos;ll be here.</p>
      )}
      <Link href="/programs/import" className="press inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-ink-soft">
        <ImageUp className="h-4 w-4" /> Import a plan from photos
      </Link>
    </div>
  );
}
