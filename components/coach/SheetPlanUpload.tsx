"use client";

import { FoundInFile, type Found } from "@/components/plan/FoundInFile";
import { ExerciseMatches } from "@/components/plan/ExerciseMatches";
import type { ExerciseMatch } from "@/lib/programs/dedupe";
import { useCallback, useRef, useState } from "react";
import { DayInput } from "@/components/ui/day-input";
import { dayFrom } from "@/lib/day-field";
import { useRouter } from "next/navigation";
import { ChevronDown, FileSpreadsheet, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { describeDay, type ImportSummary } from "@/lib/programs/sheet-summary";
import { TimesList } from "@/components/plan/TimesList";
import { CoreCheck } from "@/components/plan/CoreCheck";
import { PlanDropZone } from "@/components/plan/PlanDropZone";
import { answer, planForm } from "@/components/plan/plan-file";

/** A chosen file, made ready to send (lib: components/plan/plan-file). */
type Picked = { name: string; form: FormData };

/** What the read step returned: shown to the coach, then sent back to save. */
type Read = { grid: unknown; context: unknown; summary: ImportSummary; found?: Found; matches?: ExerciseMatch[]; weekOneStart: string | null; targets: boolean };

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Import a client's plan: a PDF, screenshots or a spreadsheet (.xlsx or .csv) through the shared drop zone, or a
 * Google Sheets link shared by link. Atlas reads it week by week into a plan and opens it as a draft to check before
 * it's assigned.
 */
export function SheetPlanUpload({ clientId, firstName }: { clientId: string; firstName: string }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [file, setFile] = useState<Picked | null>(null);
  // Optional: left empty, week 1 is dated back from the weeks the sheet shows as done.
  const [date, setDate] = useState("");
  const dateRef = useRef<HTMLInputElement>(null);
  // Optional: "4 week block, start fresh". Beats what the sheet suggests.
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // While saving: what is happening now, said under the button (saving takes a few seconds, then the draft opens).
  const [phase, setPhase] = useState<"saving" | "opening" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // After reading: the summary to confirm, and whether to bring in the completed weeks as history.
  const [read_, setRead] = useState<Read | null>(null);
  const setGrid = useCallback((grid: unknown) => setRead((r) => (r ? { ...r, grid } : r)), []);
  const [history, setHistory] = useState(true);

  async function pick(files: File[]) {
    if (files.length === 0 || busy) return;
    setError(null);
    try {
      setFile(await planForm(files));
      setLink("");
    } catch (err) {
      setFile(null);
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  async function read() {
    setError(null);
    if (!link.trim() && !file) {
      setError("Drop a PDF, a spreadsheet or screenshots, or paste a Google Sheets link.");
      return;
    }
    setBusy(true);
    // Optional: an empty field means "not given".
    const weekOne = dayFrom(dateRef, date, { allowEmpty: true });
    try {
      // A file (PDF, screenshots or a spreadsheet) goes through the shared reader, week by week; a Sheets link as before.
      let body: BodyInit;
      const headers: Record<string, string> = {};
      if (file) {
        body = file.form;
        body.set("weekOneStart", weekOne || "");
        body.set("notes", notes.trim());
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ step: "read", sheetUrl: link.trim(), ...(weekOne ? { weekOneStart: weekOne } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) });
      }
      const res = await fetch(`/api/clients/${clientId}/plan-from-sheet`, { method: "POST", headers, body });
      const data = (await answer(res)) as { error?: string; warnings?: string[]; grid?: unknown; context?: unknown; summary?: ImportSummary; found?: Found; matches?: ExerciseMatch[]; targets?: boolean };
      setBusy(false);
      if (!res.ok) return void setError(data?.error ?? "Couldn't read that plan.");
      for (const w of data.warnings ?? []) toast.warning(w, { duration: 10_000 });
      setRead({ grid: data.grid, context: data.context, summary: data.summary!, found: data.found, matches: data.matches ?? [], weekOneStart: weekOne || null, targets: data.targets === true });
      setHistory(true);
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setBusy(false);
    }
  }

  async function save() {
    if (!read_) return;
    setError(null);
    setBusy(true);
    const withHistory = history && !read_.targets && read_.summary.history.sessions > 0;
    setPhase("saving");
    try {
      const res = await fetch(`/api/clients/${clientId}/plan-from-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "save", grid: read_.grid, context: read_.context, history: withHistory, targets: read_.targets, ...(read_.weekOneStart ? { weekOneStart: read_.weekOneStart } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't save the plan.");
        setBusy(false);
        setPhase(null);
        return;
      }
      toast.success(
        `Saved as ${data.readAs}.` +
          (data.sessionsLogged > 0 ? ` ${data.sessionsLogged} past session${data.sessionsLogged === 1 ? "" : "s"} imported.` : "") +
          " Check it, then assign."
      );
      setPhase("opening");
      router.push(`/clients/${clientId}/programs/${data.assignmentId}`);
    } catch {
      setError("Couldn't reach the server. Please try again.");
      setBusy(false);
      setPhase(null);
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
        </div>
        {read_.found ? (
          <FoundInFile found={read_.found} detail={(i) => (summary.days[i] ? describeDay(summary.days[i]) : null)} />
        ) : (
          <ul className="space-y-1.5 text-[13px] text-ink-soft">
            {summary.days.map((d) => (
              <li key={d.name}>
                <span className="font-medium text-ink">{d.name}:</span> {describeDay(d)}
              </li>
            ))}
          </ul>
        )}
        {read_.targets && (
          <p className="text-[13px] font-medium text-ink">
            {summary.completedWeeks > 0 ? `Starts at week ${summary.completedWeeks + 1}, as your note says. Earlier weeks aren't imported as sessions.` : "Starts at week 1. Nothing is marked done."}
          </p>
        )}
        <ExerciseMatches matches={read_.matches ?? []} grid={read_.grid} onGrid={setGrid} />
        <TimesList times={summary.times ?? []} grid={read_.grid} onGrid={(grid) => setRead((r) => (r ? { ...r, grid } : r))} />
        <CoreCheck grid={read_.grid} onGrid={setGrid} />
        {read_.targets ? null : h.sessions > 0 ? (
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
                <Loader2 className="h-4 w-4 animate-spin" /> {phase === "opening" ? "Opening the draft…" : "Saving…"}
              </>
            ) : history && !read_.targets && h.sessions > 0 ? (
              `Save plan and ${h.sessions} past session${h.sessions === 1 ? "" : "s"}`
            ) : (
              "Save plan"
            )}
          </button>
        </div>
        {phase && (
          <p role="status" aria-live="polite" className="text-[13px] text-ink-mute">
            {phase === "saving"
              ? `Saving ${summary.weeks} week${summary.weeks === 1 ? "" : "s"}, ${summary.exercises} exercises and ${firstName}\u2019s schedule. A few seconds.`
              : "Saved. Opening the draft to check before you assign it."}
          </p>
        )}
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
        <PlanDropZone onFiles={(f) => void pick(f)} disabled={busy} />
      )}

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
