"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PlanDropZone } from "@/components/plan/PlanDropZone";
import type { Found } from "@/components/plan/FoundInFile";
import { ImportPreview } from "@/components/plan/ImportPreview";
import { answer, planForm } from "@/components/plan/plan-file";
import type { ImportPreview as Preview } from "@/lib/athlete/plan-import";

type Read = { found?: Found; grid: unknown; context: unknown; preview: Preview; warnings: string[] };

/**
 * Import a program into the library through the shared drop zone: a PDF, a spreadsheet or screenshots. It is read week
 * by week, shown for a check, then saved as a library program (one block per week) and opened in the editor.
 */
export default function ProgramImportPage() {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);

  async function pick(files: File[]) {
    if (reading || saving) return;
    setError(null);
    try {
      const { form, name } = await planForm(files);
      if (notes.trim()) form.set("notes", notes.trim());
      setReading(name);
      const res = await fetch("/api/programs/import", { method: "POST", body: form });
      const data = await answer(res);
      if (!res.ok) throw new Error(String(data.error ?? "Couldn't read that plan."));
      setRead(data as unknown as Read);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that plan.");
    } finally {
      setReading(null);
    }
  }

  async function save() {
    if (!read) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/programs/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grid: read.grid, context: read.context }) });
      const data = await answer(res);
      if (!res.ok) throw new Error(String(data.error ?? "Couldn't save the program."));
      toast.success("Saved to your library");
      router.push(`/programs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the program.");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/programs" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Programs
      </Link>

      <div>
        <h1 className="text-[30px] leading-[1.08] text-ink">Import a program</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">A PDF, a spreadsheet or screenshots of the plan. Atlas reads each week as written.</p>
      </div>

      {read ? (
        <div className="space-y-4 rounded-2xl border border-line bg-paper p-4">
          <ImportPreview preview={read.preview} found={read.found} warnings={read.warnings} grid={read.grid} onGrid={(grid) => setRead((r) => (r ? { ...r, grid } : r))} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setRead(null)} disabled={saving} className="press h-12 rounded-xl border border-line-strong px-5 text-[15px] font-semibold text-ink">
              Back
            </button>
            <button type="button" onClick={save} disabled={saving} className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-70">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save to library"
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          <PlanDropZone onFiles={(f) => void pick(f)} reading={reading} />
          <label className="block text-xs font-medium text-ink-soft">
            Context <span className="font-normal text-ink-mute">(optional, read with the file)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={reading != null}
              rows={2}
              maxLength={1000}
              placeholder="e.g. 4-week block, start at week 1"
              className="mt-1 w-full resize-none rounded-lg border border-line-strong bg-dusk-raised px-3 py-2.5 text-[15px] text-ink outline-none focus:border-ink/40"
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
