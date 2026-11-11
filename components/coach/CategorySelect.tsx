"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setProgramCategory } from "@/lib/actions/library";
import { CATEGORIES } from "@/lib/programs/categories";

/** The program's category, changeable in place. */
export function CategorySelect({ programId, value }: { programId: string; value: string | null }) {
  const [current, setCurrent] = useState(value ?? "");
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
      Category
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = current;
          setCurrent(next);
          start(async () => {
            const res = await setProgramCategory(programId, next);
            if (!res.ok) {
              setCurrent(prev);
              toast.error("Couldn't change the category.");
            }
          });
        }}
        className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm font-medium text-ink outline-none focus:border-ink/40 disabled:opacity-60"
      >
        {!current && <option value="">Choose…</option>}
        {CATEGORIES.map((c) => (
          <option key={c.tag} value={c.tag}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
