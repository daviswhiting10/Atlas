"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImageUp, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const IMPORT_STORAGE_KEY = "atlas-program-import";
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

      const { program } = await res.json();
      localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(program));
      router.push("/programs/new");
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
      className="max-w-2xl mx-auto px-5 pt-7 md:px-8 md:pt-8 space-y-5"
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
          <h1
            className="font-display leading-[1.04] tracking-[-0.01em]"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", color: "var(--ink)" }}
          >
            Import from Screenshot
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Drop one screenshot per training day — Atlas reads the day labels and builds
          the full program week automatically.
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
            ? "border-blue-400 bg-blue-50/40 dark:bg-blue-950/20"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
          loading && "pointer-events-none opacity-60"
        )}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "rgba(43,107,255,0.08)" }}
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
              ? "one per training day · click or drag · paste with ⌘V"
              : "one per training day · click to browse · paste with ⌘V · PNG, JPG, WebP"}
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
                Day {i + 1}
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
            placeholder="e.g. 4-week hypertrophy block, athlete has a knee restriction"
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
              : `${images.length} screenshot${images.length !== 1 ? "s" : ""} · Atlas will map each to its training day`}
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
