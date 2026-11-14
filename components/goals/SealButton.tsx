"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { sealChapterNow } from "@/lib/actions/goals";

export function SealButton({ goalId }: { goalId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await sealChapterNow({ goalId }).catch(() => ({ ok: false as const, error: "Couldn't seal it." }));
          if (!r.ok) toast.error(r.error);
        })
      }
      className="press font-semibold text-ink underline underline-offset-2 hover:text-ink-soft"
    >
      {pending ? "Sealing…" : "Seal now"}
    </button>
  );
}
