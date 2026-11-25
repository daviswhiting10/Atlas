"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { healChunkError } from "@/lib/net/skew-heal";
import { retryPlan } from "@/lib/plan/retry";

/**
 * The Plan tab couldn't be drawn: usually the database connection dropped for a moment.
 * It stays inside the athlete's layout (the tabs keep working) and is styled like the
 * tab's own "No plan yet" card, with one way on: Try again.
 */
export default function PlanError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    console.warn("[plan error]", error.digest ?? error.message);
    healChunkError(error); // a script left behind by a deploy: one reload fetches the new one
  }, [error]);
  return (
    <div role="alert" className="surface rise p-8">
      <h1 className="text-3xl text-ink">Couldn&apos;t load your plan</h1>
      <p className="mt-2 max-w-sm text-[15px] text-ink-soft">Usually that&apos;s the connection dropping for a moment.</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => retryPlan(router, reset))}
        className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-dusk-button px-6 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-60"
      >
        <RotateCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Try again
      </button>
    </div>
  );
}
