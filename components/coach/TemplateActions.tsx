"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, Copy, Loader2, Sparkles, Trash2 } from "lucide-react";
import { draftFromTemplate } from "@/lib/actions/coach-plan";
import { startMyProgram } from "@/lib/actions/athlete";

type Client = { id: string; fullName: string };

/** Use a library program for a client (as a draft), generate from its goals, duplicate or delete it. */
export function TemplateActions({ programId, clients, assigned }: { programId: string; clients: Client[]; assigned: number }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function useAsWritten() {
    if (!clientId) return void toast.error("Choose who it's for.");
    start(async () => {
      const res = await draftFromTemplate({ programId, clientId, startDate: date });
      if (!res.ok) return void toast.error(res.error);
      router.push(`/clients/${clientId}/programs/${res.assignmentId}`);
    });
  }

  function useForMe() {
    start(async () => {
      const res = await startMyProgram({ programId, startDate: date });
      if (!res.ok) return void toast.error(res.error);
      toast.success("It's your plan now");
      router.push("/today");
    });
  }

  function duplicate() {
    start(async () => {
      const res = await fetch(`/api/programs/${programId}/duplicate`, { method: "POST" });
      if (!res.ok) return void toast.error("Couldn't duplicate it.");
      const copy = (await res.json()) as { id: string };
      toast.success("Duplicated");
      router.push(`/programs/${copy.id}`);
    });
  }

  function remove() {
    start(async () => {
      const res = await fetch(`/api/programs/${programId}`, { method: "DELETE" });
      if (!res.ok) return void toast.error("Couldn't delete it.");
      toast.success("Removed from the library");
      router.push("/programs");
    });
  }

  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <p className="eyebrow">Use for a client</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">Exactly as written, as a draft you can edit before assigning.</p>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-3 h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-ink/40">
          <option value="">Choose a client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Start date" className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-ink/40" />
        <button type="button" onClick={useAsWritten} disabled={pending || !clientId} className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-40">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create draft
        </button>
      </div>

      <button type="button" onClick={useForMe} disabled={pending} className="press flex w-full items-start gap-3 rounded-[14px] border border-line bg-white p-4 text-left hover:border-ink/25 disabled:opacity-60">
        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
        <span>
          <span className="block text-[15px] font-semibold text-ink">Use for my training</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-mute">Run it yourself in My training, as written, starting on the date above.</span>
        </span>
      </button>

      <Link href={`/programs/new?from=${programId}`} className="press flex items-start gap-3 rounded-[14px] border border-line bg-white p-4 hover:border-ink/25">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
        <span>
          <span className="block text-[15px] font-semibold text-ink">Generate from these goals</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-mute">A fresh 12-week plan with phases and progression, using this program&apos;s goal and condition tags.</span>
        </span>
      </Link>

      <div className="flex gap-1">
        <button type="button" onClick={duplicate} disabled={pending} className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink">
          <Copy className="h-4 w-4" /> Duplicate
        </button>
        {confirmDelete ? (
          <span className="flex items-center gap-1.5 text-sm">
            <span className="text-ink-soft">{assigned > 0 ? `Clients' plans made from it stay.` : "Delete it?"}</span>
            <button type="button" onClick={remove} disabled={pending} className="press rounded-lg bg-ink px-3 py-1.5 font-semibold text-white">
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="press rounded-lg px-2 py-1.5 font-medium text-ink-soft">
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-mute hover:bg-ink/5 hover:text-ink">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
