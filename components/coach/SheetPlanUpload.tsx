"use client";

import { useRef, useState } from "react";
import { DayInput } from "@/components/ui/day-input";
import { dayFrom } from "@/lib/day-field";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** What the file picker offers. */
const ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";
/** A plan is a few hundred KB at most. */
const MAX_FILE_BYTES = 5_000_000;

type Picked = { name: string; csv: string };

/**
 * Turn a dropped or chosen file into CSV text, or say what to do instead.
 * .xlsx is read here in the browser (lib/programs/xlsx), so the server only sees CSV.
 */
async function readFile(f: File): Promise<Picked> {
  const ext = f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "numbers") throw new Error("That's a Numbers file. In Numbers, File → Export To → Excel, then drop the .xlsx here.");
  if (ext === "xls") throw new Error("That's an old .xls file. Open it in Excel and save it as .xlsx.");
  if (ext !== "xlsx" && ext !== "csv") throw new Error("Choose an .xlsx or .csv file.");
  if (f.size > MAX_FILE_BYTES) throw new Error("That file is too big for a plan. Save just the plan's tabs and try again.");
  if (ext === "csv") return { name: f.name, csv: await f.text() };
  const { xlsxToCsv } = await import("@/lib/programs/xlsx");
  return { name: f.name, csv: xlsxToCsv(new Uint8Array(await f.arrayBuffer())) };
}

/**
 * Import a client's plan from the coach's own spreadsheet: an .xlsx or .csv
 * (dropped or chosen), or a Google Sheets link shared by link. Atlas reads it
 * into a plan and opens it as a draft to check before it's assigned.
 */
export function SheetPlanUpload({ clientId, firstName }: { clientId: string; firstName: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [file, setFile] = useState<Picked | null>(null);
  const [dragging, setDragging] = useState(false);
  // Optional: left empty, week 1 is dated back from the weeks the sheet shows as done.
  const [date, setDate] = useState("");
  const dateRef = useRef<HTMLInputElement>(null);
  // Optional: "4 week block, start fresh". Beats what the sheet suggests.
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(f: File | undefined) {
    if (!f || busy) return;
    setError(null);
    try {
      const picked = await readFile(f);
      setFile(picked);
      setLink("");
    } catch (err) {
      setFile(null);
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  async function read() {
    setError(null);
    if (!link.trim() && !file) {
      setError("Drop an .xlsx or .csv file, or paste a Google Sheets link.");
      return;
    }
    setBusy(true);
    // Optional: an empty field means "not given".
    const weekOne = dayFrom(dateRef, date, { allowEmpty: true });
    try {
      const res = await fetch(`/api/clients/${clientId}/plan-from-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(file ? { csv: file.csv } : { sheetUrl: link.trim() }), ...(weekOne ? { weekOneStart: weekOne } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't read that sheet.");
        setBusy(false);
        return;
      }
      toast.success(
        `Read as ${data.readAs}.` +
          (data.sessionsLogged > 0 ? ` ${data.sessionsLogged} done session${data.sessionsLogged === 1 ? "" : "s"} logged.` : "") +
          " Check it, then assign."
      );
      for (const w of (data.warnings ?? []) as string[]) toast.warning(w, { duration: 10_000 });
      router.push(`/clients/${clientId}/programs/${data.assignmentId}`);
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setBusy(false);
    }
  }

  const field = "h-11 w-full rounded-lg border border-line-strong bg-dusk-raised px-3 text-[15px] text-ink outline-none focus:border-ink/40 disabled:opacity-60";

  return (
    <div className="space-y-4">
      {file ? (
        <div className="flex min-h-[64px] items-center gap-3 rounded-xl border border-line-strong bg-dusk-raised px-4 py-3">
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-ink-soft" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            disabled={busy}
            aria-label="Remove file"
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-mute hover:bg-ink/5 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!dragging) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "press flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 [&>*]:pointer-events-none border-dashed px-4 py-7 text-center transition-colors",
            dragging ? "border-ink/50 bg-ink/5" : "border-line-strong hover:border-ink/40 hover:bg-ink/[0.03]"
          )}
        >
          <Upload className="h-5 w-5 text-ink-soft" />
          <span className="text-[15px] font-semibold text-ink">{dragging ? "Drop it here" : "Drop a spreadsheet, or choose a file"}</span>
          <span className="text-[13px] text-ink-mute">.xlsx or .csv</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void pick(f);
        }}
      />

      {!file && (
        <div>
          <label className="text-xs font-medium text-ink-soft" htmlFor={`sheet-link-${clientId}`}>
            Or paste a Google Sheets link
          </label>
          <input
            id={`sheet-link-${clientId}`}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            disabled={busy}
            inputMode="url"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className={cn(field, "mt-1")}
          />
          <p className="mt-1 text-[12px] text-ink-mute">Only works if it&rsquo;s shared by link. If not, download it as .xlsx first (File → Download).</p>
        </div>
      )}

      <label className="block text-xs font-medium text-ink-soft">
        Context <span className="font-normal text-ink-mute">(optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
          rows={2}
          maxLength={1000}
          placeholder="e.g. 4-week block, start fresh at week 1"
          className="mt-1 w-full resize-none rounded-lg border border-line-strong bg-dusk-raised px-3 py-2.5 text-[15px] text-ink outline-none focus:border-ink/40 disabled:opacity-60"
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="text-xs font-medium text-ink-soft">
          Week 1 started <span className="font-normal text-ink-mute">(optional)</span>
          <DayInput ref={dateRef} value={date} onDay={setDate} disabled={busy} className={cn(field, "mt-1 sm:w-44")} />
        </label>
        <button type="button" onClick={read} disabled={busy} className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-70">
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
