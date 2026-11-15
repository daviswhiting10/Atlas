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
        <div className="dusk-skeleton h-[30.6px] w-40" />
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
          {/* Six rows (two workouts, four ticks): 56 each, plus the divider the real rows have. */}
          {[56, 57, 57, 57, 57, 57].map((h, i) => (
            <li key={i} style={{ height: h }} className="flex items-center">
              <div className="dusk-skeleton h-8 w-8 !rounded-full" />
              <div className="dusk-skeleton ml-3 h-5 w-44" />
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="dusk-skeleton h-[44px] w-36 !rounded-full" />
        <div className="dusk-skeleton h-[44px] w-40 !rounded-full" />
      </div>
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
