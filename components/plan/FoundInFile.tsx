import type { foundInFile } from "@/lib/programs/extract";

export type Found = ReturnType<typeof foundInFile>;

/** Before saving: how many workouts were found, how many exercises in each, and what the reader had to guess. */
export function FoundInFile({ found, detail }: { found: Found; /** Extra words for a workout's line (its structure). */ detail?: (i: number) => string | null }) {
  const n = found.workouts.length;
  return (
    <div className="space-y-2" aria-label="Found in the file">
      <p className="text-[15px] font-semibold text-ink">
        {n} workout{n === 1 ? "" : "s"} found
      </p>
      <ul className="space-y-1 text-[13px] text-ink-soft">
        {found.workouts.map((w, i) => (
          <li key={`${i}-${w.name}`}>
            <span className="font-medium text-ink">{w.name}</span> · {w.exercises} exercise{w.exercises === 1 ? "" : "s"}
            {detail?.(i) ? ` · ${detail(i)}` : ""}
          </li>
        ))}
      </ul>
      {found.uncertain.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3 text-[13px]">
          <p className="font-semibold text-ink">Check these: the reader wasn&apos;t sure</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-soft">
            {found.uncertain.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
