import Link from "next/link";

/** First run, nothing to show: one short line and the one thing to do. */
export function EmptyStart() {
  return (
    <section className="rise">
      <p className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink">Your plan is on the way. You can log a workout anytime.</p>
      <Link href="/workouts/new" className="press mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90 sm:max-w-sm">
        Log a workout
      </Link>
    </section>
  );
}
