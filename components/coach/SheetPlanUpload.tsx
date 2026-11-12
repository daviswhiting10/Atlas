"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * A client's plan from the coach's own spreadsheet: a Google Sheets link
 * or a CSV. Atlas reads it into a plan and opens it as a draft to check
 * before it's assigned.
 */
export function SheetPlanUpload({ clientId, firstName }: { clientId: string; firstName: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  // Optional: left empty, week 1 is dated back from the weeks the sheet shows as done.
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    setError(null);
    if (!link.trim() && !file) {
      setError("Paste the Google Sheet link, or choose a CSV file.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/plan-from-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(file ? { csv: file.text } : { sheetUrl: link.trim() }), ...(date ? { weekOneStart: date } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't read that sheet.");
        setBusy(false);
        return;
      }
      toast.success(
        data.weeksDone > 0
          ? `Read ${data.weeks} weeks. ${data.weeksDone} already done (${data.sessionsLogged} session${data.sessionsLogged === 1 ? "" : "s"} logged), picking up at week ${Math.min(data.weeksDone + 1, data.weeks)}. Check it, then assign.`
          : `Read ${data.weeks} week${data.weeks === 1 ? "" : "s"}, ${data.exercises} exercises. Check it, then assign.`
      );
      router.push(`/clients/${clientId}/programs/${data.assignmentId}`);
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setBusy(false);
    }
  }

  const field = "h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink outline-none focus:border-ink/40 disabled:opacity-60";

  return (
    <div className="space-y-3">
      {!file && (
        <div>
          <label className="text-xs font-medium text-ink-soft" htmlFor={`sheet-link-${clientId}`}>
            Google Sheet link
          </label>
          <input
            id={`sheet-link-${clientId}`}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            disabled={busy}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className={cn(field, "mt-1")}
          />
          <p className="mt-1 text-[12px] text-ink-mute">Shared as &ldquo;Anyone with the link&rdquo;.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {file ? (
          <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-ink-mute" />
            <span className="truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} disabled={busy} className="ml-1 text-xs font-medium text-ink-mute hover:text-ink">
              Change
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="press inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
            <Upload className="h-4 w-4" /> Or upload a CSV
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 1_000_000) return void setError("That file is too big for a plan. Export just the plan's tab as CSV.");
            setFile({ name: f.name, text: await f.text() });
            setError(null);
          }}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="text-xs font-medium text-ink-soft">
          Week 1 started <span className="font-normal text-ink-mute">(optional)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} className={cn(field, "mt-1 sm:w-44")} />
        </label>
        <button type="button" onClick={read} disabled={busy} className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-70">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the plan…
            </>
          ) : (
            `Read ${firstName}'s plan`
          )}
        </button>
      </div>
      {busy && <p className="text-[12px] text-ink-mute">About half a minute.</p>}
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
