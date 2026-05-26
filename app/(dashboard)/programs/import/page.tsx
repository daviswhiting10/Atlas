"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ImageUp, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const IMPORT_STORAGE_KEY = "atlas-program-import";

export default function ProgramImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // ─── File handling ──────────────────────────────────────────────────────────

  function acceptFile(file: File) {
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Please drop a PNG, JPEG, GIF, or WebP image.");
      return;
    }
    setError(null);
    setImage(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  function clearImage() {
    setImage(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ─── Drag & drop ────────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  // ─── Paste ───────────────────────────────────────────────────────────────────

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) acceptFile(file);
    }
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!image || loading) return;
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("image", image);
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

      // Store in localStorage so ProgramBuilder can pick it up
      localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(program));

      // Navigate to new program builder
      router.push("/programs/new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

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
          Drop a screenshot of any workout plan — Atlas will parse the exercises, sets,
          and sections and open it in the program builder.
        </p>
      </div>

      {/* Drop zone */}
      {!preview ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-colors py-16 px-6 text-center select-none",
            dragging
              ? "border-blue-400 bg-blue-50/40 dark:bg-blue-950/20"
              : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
          )}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "rgba(43,107,255,0.08)" }}
          >
            <ImageUp className="w-6 h-6" style={{ color: "var(--blue)" }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              {dragging ? "Drop to import" : "Drop a screenshot here"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              or click to browse · paste with ⌘V · PNG, JPG, WebP
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) acceptFile(f);
            }}
          />
        </div>
      ) : (
        /* Image preview */
        <div className="relative rounded-2xl overflow-hidden border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Workout plan screenshot"
            className="w-full object-contain max-h-[420px]"
          />
          <button
            type="button"
            onClick={clearImage}
            disabled={loading}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/90 border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-sm"
            title="Remove image"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Optional notes */}
      {preview && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Additional context <span className="font-normal normal-case">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. This is Block B of a 4-week program, athlete has a knee injury"
            rows={3}
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
      {preview && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Reading the plan…"
              : "Atlas will parse exercises, sets, and sections automatically."}
          </p>
          <Button
            onClick={handleImport}
            disabled={loading}
            className="gap-1.5 min-w-[130px]"
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
