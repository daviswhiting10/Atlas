import type { ImportPreview as Preview } from "@/lib/athlete/plan-import";

/** A plan read from a file, for a quick check before it is saved: its shape, each day, and one lift week by week. */
export function ImportPreview({ preview, warnings = [] }: { preview: Preview; warnings?: string[] }) {
  return (
    <div className="space-y-4" aria-label="Check your plan">
      <div>
        <p className="text-[17px] font-semibold text-ink">{preview.title}</p>
        <p className="mt-0.5 text-[13px] text-ink-mute">{preview.meta}</p>
      </div>
      <ul className="space-y-1.5 text-[13px] text-ink-soft">
        {preview.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {preview.weekly && (
        <div className="rounded-xl border border-line px-3.5 py-3 text-[13px]">
          <p className="font-semibold text-ink">{preview.weekly.exercise}, week by week</p>
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {preview.weekly.weeks.map((w) => (
              <li key={w} className="tnum">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.sameEveryWeek && <p className="text-[13px] text-ink-mute">Every week is the same in this plan.</p>}
      {warnings.map((w) => (
        <p key={w} className="text-[13px] text-warn">
          {w}
        </p>
      ))}
    </div>
  );
}
