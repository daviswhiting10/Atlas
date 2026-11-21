"use client";

import { useRef, useState } from "react";
import { DayInput } from "@/components/ui/day-input";
import { dayFrom } from "@/lib/day-field";
import { useRouter } from "next/navigation";
import { ChevronDown, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { describeDay, type ImportSummary } from "@/lib/programs/sheet-summary";
import { PHOTO_TYPES, toProgramBody, type ImportedProgram } from "@/lib/programs/screenshot-program";
import { draftFromTemplate } from "@/lib/actions/coach-plan";

/** What the file picker offers. */
const ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv," + PHOTO_TYPES.join(",");
/** Photos go up in one request: Vercel takes 4.5 MB. */
export const MAX_PHOTO_BYTES = 4_000_000;
/** A plan is a few hundred KB at most. */
const MAX_FILE_BYTES = 5_000_000;

type Picked = { name: string; csv: string; photos?: File[] };

/** What the read step returned: shown to the coach, then sent back to save. */
type Read = { grid: unknown; context: unknown; summary: ImportSummary; weekOneStart: string | null };

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Turn a dropped or chosen file into CSV text, or say what to do instead.
 * .xlsx is read here in the browser (lib/programs/xlsx), so the server only sees CSV.
 */
export async function readFile(f: File): Promise<Picked> {
  const ext = f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "numbers") throw new Error("That's a Numbers file. In Numbers, File → Export To → Excel, then drop the .xlsx here.");
  if (ext === "xls") throw new Error("That's an old .xls file. Open it in Excel and save it as .xlsx.");
  if (ext !== "xlsx" && ext !== "csv") throw new Error("Choose an .xlsx or .csv file, or photos of the plan.");
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
  // After reading: the summary to confirm, and whether to bring in the completed weeks as history.
  const [read_, setRead] = useState<Read | null>(null);
  const [history, setHistory] = useState(true);

  async function pick(list: FileList | File[] | null | undefined) {
    const files = Array.from(list ?? []);
    const f = files[0];
    if (!f || busy) return;
    setError(null);
    try {
      // Photos (screenshots) of the plan: one or several, read by the photo reader.
      const photos = files.filter((x) => PHOTO_TYPES.includes(x.type));
      if (photos.length > 0) {
        if (photos.length !== files.length) throw new Error("Choose a spreadsheet or photos, not both.");
        if (photos.reduce((n, x) => n + x.size, 0) > MAX_PHOTO_BYTES) throw new Error("Those photos are too big together. Use fewer, or screenshots.");
        setFile({ name: photos.length === 1 ? photos[0].name : `${photos.length} photos`, csv: "", photos });
        setLink("");
        return;
      }
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
    if (file?.photos) return void readPhotos(file.photos, weekOne);
    try {
      const res = await fetch(`/api/clients/${clientId}/plan-from-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "read", ...(file ? { csv: file.csv } : { sheetUrl: link.trim() }), ...(weekOne ? { weekOneStart: weekOne } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) return void setError(data?.error ?? "Couldn't read that sheet.");
      for (const w of (data.warnings ?? []) as string[]) toast.warning(w, { duration: 10_000 });
      setRead({ grid: data.grid, context: data.context, summary: data.summary, weekOneStart: weekOne || null });
      setHistory(true);
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setBusy(false);
    }
  }

  /** Photos: read into a program (saved to the library, as the photo import does), then a draft for this client. */
  async function readPhotos(photos: File[], weekOne: string) {
    try {
      const form = new FormData();
      photos.forEach((p, i) => form.append(`image${i}`, p));
      if (notes.trim()) form.append("notes", notes.trim());
      const res = await fetch("/api/ai/program-import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Couldn't read those photos.");
      const { program, readAs, warnings } = data as { program: ImportedProgram; readAs?: string; warnings?: string[] };
      const saved = await fetch("/api/programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toProgramBody(program)) });
      if (!saved.ok) throw new Error("Read the photos, but couldn't save the plan. Try again.");
      const { id } = (await saved.json()) as { id: string };
      const today = new Date();
      const startDate = weekOne || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const draft = await draftFromTemplate({ programId: id, clientId, startDate });
      if (!draft.ok) throw new Error(draft.error);
      toast.success(`${readAs ? `Read as ${readAs}. ` : ""}Check it, then assign.`);
      for (const w of warnings ?? []) toast.warning(w, { duration: 10_000 });
      router.push(`/clients/${clientId}/programs/${draft.assignmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read those photos.");
      setBusy(false);
    }
  }

  async function save() {
    if (!read_) return;
    setError(null);
    setBusy(true);
    const withHistory = history && read_.summary.history.sessions > 0;
    try {
      const res = await fetch(`/api/clients/${clientId}/plan-from-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "save", grid: read_.grid, context: read_.context, history: withHistory, ...(read_.weekOneStart ? { weekOneStart: read_.weekOneStart } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't save the plan.");
        setBusy(false);
        return;
      }
      toast.success(
        `Saved as ${data.readAs}.` +
          (data.sessionsLogged > 0 ? ` ${data.sessionsLogged} past session${data.sessionsLogged === 1 ? "" : "s"} imported.` : "") +
          " Check it, then assign."
      );
      router.push(`/clients/${clientId}/programs/${data.assignmentId}`);
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setBusy(false);
    }
  }

  if (read_) {
    const { summary } = read_;
    const h = summary.history;
    const weeksDone = h.perWeek.map((w) => w.week);
    const weekRange = weeksDone.length === 0 ? "" : weeksDone.length === 1 ? `Week ${weeksDone[0]}` : `Weeks ${weeksDone[0]}–${weeksDone[weeksDone.length - 1]}`;
    return (
      <div className="space-y-4">
        <div>
          <p className="text-[15px] font-semibold text-ink">Read as {summary.readAs}</p>
          <p className="mt-0.5 text-[13px] text-ink-mute">
            {summary.exercises} exercises · week 1 started {shortDay(summary.weekOneStart)}
          </p>
        </div>
        <ul className="space-y-1.5 text-[13px] text-ink-soft">
          {summary.days.map((d) => (
            <li key={d.name}>
              <span className="font-medium text-ink">{d.name}:</span> {describeDay(d)}
            </li>
          ))}
        </ul>
        {h.sessions > 0 ? (
          <label className="flex items-start gap-3 rounded-lg border border-line-strong bg-dusk-raised p-3">
            <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} disabled={busy} className="mt-1 h-4 w-4 shrink-0" />
            <span className="text-sm">
              <span className="block font-semibold text-ink">Import completed weeks as history</span>
              <span className="mt-0.5 block text-ink-soft">
                {weekRange}: {h.sessions} session{h.sessions === 1 ? "" : "s"}, {h.sets} sets, dated {shortDay(h.from!)}
                {h.to !== h.from ? ` – ${shortDay(h.to!)}` : ""}. {firstName}&rsquo;s progress charts fill in now and keep updating as you log.
              </span>
            </span>
          </label>
        ) : (
          <p className="text-[13px] text-ink-mute">No completed weeks in this sheet, so there&rsquo;s no history to import.</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => setRead(null)} disabled={busy} className="press h-11 rounded-xl border border-line-strong px-5 text-[15px] font-semibold text-ink hover:border-ink/40">
            Back
          </button>
          <button type="button" onClick={save} disabled={busy} className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-70">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : history && h.sessions > 0 ? (
              `Save plan and ${h.sessions} past session${h.sessions === 1 ? "" : "s"}`
            ) : (
              "Save plan"
            )}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm leading-relaxed text-destructive">
            {error}
          </p>
        )}
      </div>
    );
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
            void pick(e.dataTransfer.files);
          }}
          className={cn(
            "press flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 [&>*]:pointer-events-none border-dashed px-4 py-7 text-center transition-colors",
            dragging ? "border-ink/50 bg-ink/5" : "border-line-strong hover:border-ink/40 hover:bg-ink/[0.03]"
          )}
        >
          <Upload className="h-5 w-5 text-ink-soft" />
          <span className="text-[15px] font-semibold text-ink">{dragging ? "Drop it here" : "Drop a spreadsheet or photos, or choose"}</span>
          <span className="text-[13px] text-ink-mute">.xlsx, .csv or screenshots of the plan</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void pick(files);
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

      {/* Optional, so folded away: the importer works the same with or without them. */}
      <details className="group rounded-xl border border-line">
        <summary className="press flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-[15px] font-medium text-ink-soft [&::-webkit-details-marker]:hidden">
          Details <span className="text-[13px] font-normal text-ink-mute">(optional)</span>
          <ChevronDown className="ml-auto h-4 w-4 text-ink-mute transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-line px-3.5 pb-3.5 pt-3">
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
          <label className="block text-xs font-medium text-ink-soft">
            Week 1 started <span className="font-normal text-ink-mute">(optional)</span>
            <DayInput ref={dateRef} value={date} onDay={setDate} disabled={busy} className={cn(field, "mt-1 sm:w-44")} />
          </label>
        </div>
      </details>

      <button type="button" onClick={read} disabled={busy} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-70">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the plan…
          </>
        ) : (
          `Read ${firstName}'s plan`
        )}
      </button>
      {busy && <p className="text-[12px] text-ink-mute">About half a minute.</p>}
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
