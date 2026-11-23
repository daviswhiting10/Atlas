"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPT } from "./plan-file";

/**
 * The one drop zone every importer uses (Programs library, a client's Plan tab, Today, You): drag a plan in or choose a
 * file. PDF, spreadsheet or screenshots. While a file is being read it shows that instead.
 */
export function PlanDropZone({
  onFiles,
  reading,
  disabled = false,
  title = "Drag a plan in, or choose a file",
}: {
  onFiles: (files: File[]) => void;
  /** The name of what is being read, while it is. */
  reading?: string | null;
  disabled?: boolean;
  title?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <>
      {reading ? (
        <div className="flex min-h-[64px] items-center gap-3 rounded-xl border border-line-strong bg-dusk-raised px-4 py-3" role="status">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-ink-soft" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-ink">Reading {reading}…</span>
            <span className="block text-[12px] text-ink-mute">About half a minute.</span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!dragging) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "press flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 [&>*]:pointer-events-none border-dashed px-4 py-7 text-center transition-colors disabled:opacity-60",
            dragging ? "border-ink/50 bg-ink/5" : "border-line-strong hover:border-ink/40 hover:bg-ink/[0.03]"
          )}
        >
          {dragging ? <Upload className="h-5 w-5 text-ink-soft" /> : <FileText className="h-5 w-5 text-ink-soft" />}
          <span className="text-[15px] font-semibold text-ink">{dragging ? "Drop it here" : title}</span>
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
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
