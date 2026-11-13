"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImageUp, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** What the import route returns: days of sections of exercises. */
type ImportedProgram = {
  name: string;
  description: string;
  durationWeeks: number;
  goals: string[];
  conditions: string[];
  days: Array<{
    name: string;
    dayOfWeek: number;
    order: number;
    sections: Array<{ name: string; exercises: Array<{ exerciseId: string; order: number; notes: string; prescribedSets: Array<Record<string, unknown>> }> }>;
  }>;
};

/** One block that repeats for the program's length; each day becomes a workout, sections flattened in order. */
function toProgramBody(p: ImportedProgram) {
  return {
    name: p.name || "Imported program",
    description: p.description || null,
    goalTags: { goals: p.goals ?? [], conditions: p.conditions ?? [] },
    blocks: [
      {
        name: "Block 1",
        order: 1,
        weeks: Math.max(1, Math.round(p.durationWeeks || 1)),
        workouts: p.days.map((d, i) => ({
          name: d.name,
          dayOfWeek: Math.min(7, Math.max(1, d.dayOfWeek)),
          order: i + 1,
          exercises: d.sections
            .flatMap((section) => section.exercises.map((e) => ({ ...e, section: section.name })))
            .map((e, j) => ({
              exerciseId: e.exerciseId,
              order: j + 1,
              notes: e.notes || null,
              section: e.section,
              prescribedSets: e.prescribedSets.map((set, k) => ({ ...set, setNumber: k + 1 })),
            })),
        })),
      },
    ],
  };
}
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

type ImageEntry = { file: File; previewUrl: string };

export default function ProgramImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // ─── File handling ──────────────────────────────────────────────────────────

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const valid = incoming.filter((f) => ALLOWED.includes(f.type));
    const invalid = incoming.length - valid.length;
    if (invalid > 0) setError(`${invalid} file(s) skipped — PNG, JPG, GIF, or WebP only.`);
    else setError(null);
    if (valid.length === 0) return;

    setImages((prev) => {
      const combined = [
        ...prev,
        ...valid.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) })),
      ];
      return combined;
    });
  }

  function removeImage(idx: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // ─── Drag & drop ────────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when leaving the outer container, not child elements
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }, []);

  // ─── Paste ───────────────────────────────────────────────────────────────────

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((i) => i.type.startsWith("image/"));
    const files = imageItems.map((i) => i.getAsFile()).filter(Boolean) as File[];
    if (files.length) addFiles(files);
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (images.length === 0 || loading) return;
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      images.forEach((entry, i) => form.append(`image${i}`, entry.file));
      if (notes.trim()) form.append("notes", notes.trim());

      const res = await fetch("/api/ai/program-import", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      const { program, readAs, warnings } = (await res.json()) as { program: ImportedProgram; readAs?: string; warnings?: string[] };

      // Save it to the library as written. From there it can be used for a
      // client as a draft, or its goals can seed a generated plan.
      const save = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toProgramBody(program)),
      });
      if (!save.ok) throw new Error("The program was read, but couldn't be saved. Try again.");
      const saved = (await save.json()) as { id: string };
      if (readAs) toast.success(`Read as ${readAs}.`);
      for (const w of warnings ?? []) toast.warning(w, { duration: 10_000 });
      router.push(`/programs/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const hasImages = images.length > 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="max-w-2xl space-y-5"
      onPaste={handlePaste}
    >
      {/* Back */}
      <Link
        href="/programs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Programs
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ImageUp className="w-5 h-5" style={{ color: "var(--blue)" }} />
          <h1 className="text-[30px] leading-[1.08] text-ink">
            Import from Screenshot
          </h1>
        </div>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Drop screenshots of the plan. Atlas reads the day labels and builds the program.
        </p>
      </div>

      {/* Drop zone — always visible so you can keep adding images */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !loading && fileInputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-colors px-6 text-center select-none",
          hasImages ? "py-6" : "py-16",
          dragging
            ? "border-signal/50 bg-signal/10/40 dark:bg-signal/20/20"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
          loading && "pointer-events-none opacity-60"
        )}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "rgba(30,107,78,0.08)" }}
        >
          {hasImages ? (
            <Plus className="w-5 h-5" style={{ color: "var(--blue)" }} />
          ) : (
            <ImageUp className="w-5 h-5" style={{ color: "var(--blue)" }} />
          )}
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
            {dragging
              ? "Drop to add"
              : hasImages
              ? "Add another screenshot"
              : "Drop screenshots here"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasImages
              ? "click or drag · paste with ⌘V"
              : "click to browse · paste with ⌘V · PNG, JPG, WebP"}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Thumbnail grid */}
      {hasImages && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((entry, i) => (
            <div
              key={entry.previewUrl}
              className="relative group rounded-xl overflow-hidden border bg-muted/20 aspect-video"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.previewUrl}
                alt={`Screenshot ${i + 1}`}
                className="w-full h-full object-cover"
              />
              {/* Day badge */}
              <span className="absolute bottom-1.5 left-1.5 bg-background/85 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] font-medium leading-none">
                {i + 1}
              </span>
              {/* Remove button */}
              {!loading && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/85 backdrop-blur-sm border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Optional notes */}
      {hasImages && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Additional context <span className="font-normal normal-case">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 4-week block, 2 days legs, 2 days upper, start at week 1"
            rows={2}
            disabled={loading}
            className={cn(
              "w-full rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-colors",
              loading && "opacity-60"
            )}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Action */}
      {hasImages && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {loading
              ? `Reading ${images.length} screenshot${images.length !== 1 ? "s" : ""}…`
              : `${images.length} screenshot${images.length !== 1 ? "s" : ""}`}
          </p>
          <Button
            onClick={handleImport}
            disabled={loading}
            className="gap-1.5 min-w-[140px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Parsing…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Build Program
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
