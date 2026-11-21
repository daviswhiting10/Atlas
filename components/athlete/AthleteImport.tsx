"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { readFile } from "@/components/coach/SheetPlanUpload";
import { PHOTO_TYPES } from "@/lib/programs/screenshot-program";
import type { ImportPreview } from "@/lib/athlete/plan-import";
import { MAX_UPLOAD_BYTES, fitWithin, tooBigMessage } from "@/lib/athlete/upload-limits";

const ACCEPT = ".pdf,application/pdf,.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv," + PHOTO_TYPES.join(",");
/** What the read step returned. The grid goes back, as read, to be saved. */
type Read = { grid: unknown; preview: ImportPreview; warnings: string[] };

/** A screenshot made smaller before upload (a phone photo is often 3–5 MB; this is a few hundred KB). Kept as is if it can't be. */
async function shrink(f: File): Promise<File> {
  if (f.type === "image/gif" || f.size < 500_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const { width, height } = fitWithin(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

/** The server's answer, or a plain message when there isn't one (the host refused the upload, or the server failed). */
async function answer(res: Response): Promise<Record<string, unknown>> {
  const data = await res.json().catch(() => null);
  if (data) return data;
  if (res.status === 413) return { error: "That's bigger than Atlas can take in one go. Try screenshots of the pages, a few at a time." };
  return { error: "Couldn't read that plan. Try screenshots of its pages instead." };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Import your own plan: drop or choose a PDF, a spreadsheet or screenshots. It is read as soon as it is chosen,
 * shown for a quick check, and one tap saves it as your plan. Today then shows the first workout.
 */
export function AthleteImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);

  async function pick(list: FileList | File[] | null | undefined) {
    const files = Array.from(list ?? []);
    if (files.length === 0 || busy) return;
    setError(null);
    setRead(null);
    try {
      const form = new FormData();
      const first = files[0];
      const ext = first.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
      const visual = files.every((f) => f.type === "application/pdf" || ext === "pdf" || PHOTO_TYPES.includes(f.type));
      if (visual) {
        const pdf = files.some((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
        const sending = pdf ? files : await Promise.all(files.map(shrink));
        const bytes = sending.reduce((n, f) => n + f.size, 0);
        if (bytes > MAX_UPLOAD_BYTES) throw new Error(tooBigMessage(bytes, pdf));
        sending.forEach((f, i) => form.append(`file${i}`, f));
        setName(files.length === 1 ? first.name : `${files.length} files`);
      } else {
        if (files.length > 1) throw new Error("Choose one spreadsheet, or a PDF, or screenshots.");
        form.append("csv", (await readFile(first)).csv);
        setName(first.name);
      }
      setBusy("read");
      const res = await fetch("/api/athlete/plan-import", { method: "POST", body: form });
      const data = await answer(res);
      if (!res.ok) throw new Error(String(data.error ?? "Couldn't read that plan."));
      setRead(data as unknown as Read);
    } catch (err) {
      setName(null);
      setError(err instanceof Error ? err.message : "Couldn't read that plan.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!read) return;
    setError(null);
    setBusy("save");
    try {
      const res = await fetch("/api/athlete/plan-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "save", startDate: today(), grid: read.grid }),
      });
      const data = await answer(res);
      if (!res.ok) throw new Error(String(data.error ?? "Couldn't save the plan."));
      toast.success("Your plan is saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the plan.");
      setBusy(null);
    }
  }

  if (read) {
    return (
      <div className="space-y-4" aria-label="Check your plan">
        <div>
          <p className="text-[17px] font-semibold text-ink">{read.preview.title}</p>
          <p className="mt-0.5 text-[13px] text-ink-mute">{read.preview.meta}</p>
        </div>
        <ul className="space-y-1.5 text-[13px] text-ink-soft">
          {read.preview.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {read.preview.weekly && (
          <div className="rounded-xl border border-line px-3.5 py-3 text-[13px]">
            <p className="font-semibold text-ink">{read.preview.weekly.exercise}, week by week</p>
            <ul className="mt-1 space-y-0.5 text-ink-soft">
              {read.preview.weekly.weeks.map((w) => (
                <li key={w} className="tnum">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
        {read.preview.sameEveryWeek && <p className="text-[13px] text-ink-mute">Every week is the same in this plan.</p>}
        {read.warnings.map((w) => (
          <p key={w} className="text-[13px] text-warn">
            {w}
          </p>
        ))}
        <div className="flex gap-2">
          <button type="button" onClick={() => { setRead(null); setName(null); }} disabled={busy != null} className="press h-12 rounded-xl border border-line-strong px-5 text-[15px] font-semibold text-ink">
            Back
          </button>
          <button type="button" onClick={save} disabled={busy != null} className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-70">
            {busy === "save" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
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

  return (
    <div className="space-y-3">
      {busy === "read" ? (
        <div className="flex min-h-[64px] items-center gap-3 rounded-xl border border-line-strong bg-dusk-raised px-4 py-3" role="status">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-ink-soft" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-ink">Reading {name}…</span>
            <span className="block text-[12px] text-ink-mute">About half a minute.</span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
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
          {dragging ? <Upload className="h-5 w-5 text-ink-soft" /> : <FileText className="h-5 w-5 text-ink-soft" />}
          <span className="text-[15px] font-semibold text-ink">{dragging ? "Drop it here" : "Drag a plan in, or choose a file"}</span>
          <span className="text-[13px] text-ink-mute">PDF, spreadsheet or screenshots</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        data-testid="plan-file"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void pick(files);
        }}
      />
      {name && !busy && error && (
        <button type="button" onClick={() => setError(null)} aria-label="Clear" className="sr-only">
          <X />
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
