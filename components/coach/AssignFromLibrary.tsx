"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, ChevronRight, Loader2 } from "lucide-react";
import { draftFromTemplate } from "@/lib/actions/coach-plan";
import { cn } from "@/lib/utils";

type LibraryProgram = { id: string; name: string; isTemplate: boolean; durationWeeks: number };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** How many programs show before "All programs". */
const SHOWN = 5;

/**
 * Start a client's plan from a program in the coach's library: tap one, then "Use for X" (the same two steps as
 * before, the same action). Drafts are not visible to the client until the coach assigns them.
 */
export function AssignFromLibrary({ clientId, firstName }: { clientId: string; firstName: string }) {
  const router = useRouter();
  const [programs, setPrograms] = useState<LibraryProgram[] | null>(null);
  const [programId, setProgramId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/programs")
      .then((r) => (r.ok ? r.json() : []))
      .then((all: LibraryProgram[]) => setPrograms(all.filter((p) => p.isTemplate).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setPrograms([]));
  }, []);

  async function assign() {
    if (!programId) return void toast.error("Choose a program.");
    setBusy(true);
    const res = await draftFromTemplate({ programId, clientId, startDate: todayIso() });
    if (!res.ok) {
      setBusy(false);
      return void toast.error(res.error);
    }
    router.push(`/clients/${clientId}/programs/${res.assignmentId}`);
  }

  const row = "press flex min-h-[56px] w-full items-center gap-3 border-t border-line px-1 text-left";
  return (
    <div>
      {programs == null ? (
        <p className="flex min-h-11 items-center gap-2 text-sm text-ink-mute">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your programs…
        </p>
      ) : programs.length === 0 ? (
        <p className="flex min-h-11 items-center text-sm text-ink-mute">No programs in your library yet</p>
      ) : (
        <>
          <p className="eyebrow mb-1">From a program</p>
          {programs.slice(0, SHOWN).map((p) => {
            const on = programId === p.id;
            return (
              <div key={p.id} className={cn(on && "rounded-xl bg-ink/[0.04]")}>
                <button type="button" onClick={() => setProgramId(on ? "" : p.id)} disabled={busy} aria-pressed={on} className={row}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-ink">{p.name}</span>
                    <span className="block text-xs text-ink-mute">{p.durationWeeks} wk</span>
                  </span>
                  {on ? <Check className="h-5 w-5 shrink-0 text-signal" strokeWidth={3} /> : <ChevronRight className="h-5 w-5 shrink-0 text-ink-mute" />}
                </button>
                {on && (
                  <div className="px-1 pb-3">
                    <button
                      type="button"
                      onClick={assign}
                      disabled={busy}
                      className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-dusk-button text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-60"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Use for {firstName}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      <Link href="/programs" className={cn(row, "text-[15px] font-medium text-ink-soft hover:text-ink")}>
        <span className="flex-1">All programs</span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
      <Link href="/programs/new" className={cn(row, "text-[15px] font-medium text-ink-soft hover:text-ink")}>
        <span className="flex-1">Build a program from scratch</span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>
    </div>
  );
}
