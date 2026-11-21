"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PlanDropZone } from "@/components/plan/PlanDropZone";
import { ImportPreview } from "@/components/plan/ImportPreview";
import { answer, planForm } from "@/components/plan/plan-file";
import type { ImportPreview as Preview } from "@/lib/athlete/plan-import";

/** What the read step returned. The grid goes back, as read, to be saved. */
type Read = { grid: unknown; preview: Preview; warnings: string[] };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Import your own plan through the shared drop zone: a PDF, a spreadsheet or screenshots. It is read as soon as it is
 * chosen, shown for a quick check, and one tap saves it as your plan; then `after` (Today, where the first workout
 * waits with Start).
 */
export function AthleteImport({
  saveLabel = "Save plan",
  after = "/today",
  title,
  onRead,
}: {
  saveLabel?: string;
  after?: string;
  title?: string;
  /** Told when a plan has been read (the check is showing) and when it is set aside, so a host screen can step back. */
  onRead?: (shown: boolean) => void;
}) {
  const router = useRouter();
  const [reading, setReading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);

  async function pick(files: File[]) {
    if (reading || saving) return;
    setError(null);
    setRead(null);
    try {
      const { form, name } = await planForm(files);
      setReading(name);
      const res = await fetch("/api/athlete/plan-import", { method: "POST", body: form });
      const data = await answer(res);
      if (!res.ok) throw new Error(String(data.error ?? "Couldn't read that plan."));
      setRead(data as unknown as Read);
      onRead?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that plan.");
    } finally {
      setReading(null);
    }
  }

  async function save() {
    if (!read) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/athlete/plan-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "save", startDate: today(), grid: read.grid }),
      });
      const data = await answer(res);
      if (!res.ok) throw new Error(String(data.error ?? "Couldn't save the plan."));
      toast.success("Your plan is saved");
      if (after === location.pathname) router.refresh();
      else router.push(after);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the plan.");
      setSaving(false);
    }
  }

  const alert = error && (
    <p role="alert" className="text-sm leading-relaxed text-destructive">
      {error}
    </p>
  );

  if (read) {
    return (
      <div className="space-y-4">
        <ImportPreview preview={read.preview} warnings={read.warnings} />
        <div className="flex gap-2">
          <button type="button" onClick={() => { setRead(null); onRead?.(false); }} disabled={saving} className="press h-12 rounded-xl border border-line-strong px-5 text-[15px] font-semibold text-ink">
            Back
          </button>
          <button type="button" onClick={save} disabled={saving} className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-70">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              saveLabel
            )}
          </button>
        </div>
        {alert}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PlanDropZone onFiles={pick} reading={reading} title={title} />
      {alert}
    </div>
  );
}
