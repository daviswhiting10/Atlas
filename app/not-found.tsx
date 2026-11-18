import Link from "next/link";

/** A link that leads nowhere: say so, and offer the way home. */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-bone px-6 text-center">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">Nothing here</h1>
      <Link href="/" className="press mt-8 flex h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90">
        Go home
      </Link>
    </main>
  );
}
