"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { draftFromTemplate } from "@/lib/actions/coach-plan";

type LibraryProgram = { id: string; name: string; durationWeeks: number; isTemplate: boolean };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Give a client a program from the coach's library. It opens as a draft
 * starting today, to check and assign (the same path as the library's
 * "Use for a client"). Unstyled beyond the shared tokens: the coach screens'
 * redesign owns the look.
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

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-ink-soft" htmlFor={`library-${clientId}`}>
        From your library
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id={`library-${clientId}`}
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          disabled={busy || programs == null}
          className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-dusk-raised px-3 text-[15px] text-ink outline-none focus:border-ink/40"
        >
          <option value="">{programs == null ? "Loading…" : programs.length === 0 ? "No programs in your library yet" : "Choose a program"}</option>
          {programs?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.durationWeeks} wk
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={assign}
          disabled={busy || !programId}
          className="press flex h-11 items-center justify-center gap-2 rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Use for {firstName}
        </button>
      </div>
      <Link href="/programs" className="press inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
        Open the program library <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
