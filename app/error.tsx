"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { healChunkError } from "@/lib/net/skew-heal";
import { retryScreen } from "@/lib/net/retry";

/** Something broke while drawing a screen: never a raw error, always a way on. */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    console.warn("[screen error]", error.digest ?? error.message);
    healChunkError(error); // a script left behind by a deploy: one reload fetches the new one
  }, [error]);
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">That didn&apos;t load</h1>
      {/* Asks the server again (a dropped connection is usually back by now), then redraws. */}
      <button type="button" disabled={pending} onClick={() => start(() => retryScreen(router, reset))} className="press mt-8 flex h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90 disabled:opacity-60">
        Try again
      </button>
      <Link href="/" className="press mt-2 flex min-h-11 items-center text-[15px] font-medium text-ink-soft hover:text-ink">
        Go home
      </Link>
    </main>
  );
}
