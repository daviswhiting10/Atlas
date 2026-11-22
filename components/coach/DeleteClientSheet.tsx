"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useEscape } from "@/hooks/use-escape";

export type DeletePreview = { name: string; sessions: number; login: string | null };

/** Exactly what goes, then a red Delete. Nothing is deleted until it's pressed. */
export function DeleteClientSheet({ preview, onDelete, onClose }: { preview: DeletePreview; onDelete: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  useEscape(true, onClose);
  const first = preview.name.split(" ")[0];
  // Drawn on <body>: inside the page's animated container it would sit under the live-session bar.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-night/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${preview.name}`}
        onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full max-w-md rounded-t-2xl bg-bone p-6 sm:rounded-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <h2 className="text-2xl text-ink">Delete {preview.name}?</h2>
        <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-ink-soft">
          <li>
            {preview.sessions} logged session{preview.sessions === 1 ? "" : "s"}, with every set, note and goal
          </li>
          <li>Her plans (your program library stays)</li>
          <li>{preview.login ? <>Her login, {preview.login}: {first} won&apos;t be able to sign in</> : "No login to remove"}</li>
        </ul>
        <p className="mt-3 text-sm font-medium text-ink">This can&apos;t be undone.</p>
        <div className="mt-6 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onDelete();
              setBusy(false);
            }}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="press flex h-11 w-full items-center justify-center text-sm font-medium text-ink-soft">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
