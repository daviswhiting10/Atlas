import type { CSSProperties } from "react";

/**
 * Loading shapes. Each is built from the same classes and sizes as the real thing
 * (GoalCard, ChapterView), so when the data arrives nothing moves: the strip is the
 * real grid with quiet dots, and rows have the real row heights.
 * They use 75 dots, the length of the one goal there is today.
 */

const dots = (n: number) => Array.from({ length: n }, (_, i) => <span key={i} className="dusk-dot" data-state="future" />);
const stripStyle = { "--dusk-dots-columns": 15, "--dusk-dots-columns-wide": 25 } as CSSProperties;

/** The Today card while the goal loads. */
export function GoalCardSkeleton() {
  return (
    <section className="dusk dusk-card sm:p-8" aria-busy="true" aria-label="Loading your goal">
      <div className="pt-1.5">
        <div className="dusk-skeleton h-[31px] w-40" />
      </div>
      <div className="mt-6 flex items-end gap-3">
        <div className="dusk-skeleton h-[57.6px] w-[76px]" />
        <div className="pb-1" aria-hidden>
          <div className="dusk-skeleton h-[14px] w-8" />
          <div className="dusk-skeleton mt-1 h-[18px] w-10" />
        </div>
      </div>
      <div className="mt-6">
        <div className="dusk-dots" style={stripStyle}>
          {dots(75)}
        </div>
      </div>
      <div className="mt-6">
        <ul className="divide-y divide-dusk-line">
          {/* The real rows: a workout row is 56; the one with the tag chips is 56 + 8 + a 44 row, plus its divider; check-ins are 56 plus a divider. */}
          {[56, 56 + 8 + 44 + 1, 57, 57, 57, 57].map((h, i) => (
            <li key={i} style={{ height: h }} className="flex items-start pt-3">
              <div className="dusk-skeleton h-8 w-8 !rounded-full" />
              <div className="dusk-skeleton ml-3 mt-[6px] h-5 w-44" />
            </li>
          ))}
        </ul>
        <div className="dusk-skeleton mt-5 h-[44px] w-full !rounded-full sm:w-44" />
      </div>
      <div className="dusk-skeleton mt-3 h-[44px] w-44 !rounded-full" />
    </section>
  );
}

/** A chapter (a finished goal) while it loads. */
export function ChapterSkeleton() {
  return (
    <div className="dusk dusk-page mx-auto max-w-2xl" aria-busy="true" aria-label="Loading">
      <div className="dusk-backdrop" aria-hidden />
      <div className="-ml-2 mb-4 h-[44px]" />
      <div className="dusk-skeleton h-[45px] w-56" />
      <div className="mt-8">
        <div className="dusk-dots" style={stripStyle}>
          {dots(75)}
        </div>
      </div>
      <div className="mt-10 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dusk-skeleton h-[56px] w-full" />
        ))}
      </div>
    </div>
  );
}
