"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DoorRows } from "@/components/plan/DoorRows";
import { AthleteImport } from "@/components/athlete/AthleteImport";
import { PlanWizard } from "@/components/athlete/PlanWizard";
import { startOwnPlan } from "@/lib/actions/athlete";
import type { Prefs } from "@/lib/plan/generator";

/**
 * Today with no plan, for someone who makes their own: one card, "No plan yet", the same three doors as the coach's
 * Plan tab, and "Log another workout" kept under it for logging without a plan.
 */
export function NoPlanCard({ prefs }: { prefs: Prefs }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function own() {
    setError(null);
    start(async () => {
      const r = await startOwnPlan();
      if (!r.ok) return void setError(r.error);
      toast.success("Plan started. Add your first exercises.");
      router.push("/plan");
    });
  }

  return (
    <section className="rise" aria-label="No plan yet">
      <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-ink">No plan yet</h1>
      <p className="mt-2 text-[15px] text-ink-mute">Get one in a minute. Pick a way in.</p>
      <DoorRows
        idPrefix="today-plan"
        className="mt-5 overflow-hidden rounded-2xl border border-line bg-paper sm:max-w-md"
        scroll={false}
        panel={(door) => (
          <>
            {door === "import" && <AthleteImport />}
            {door === "own" && (
              <div className="space-y-3">
                <p className="text-[15px] text-ink-soft">Start with an empty plan and add your own exercises, sets and reps.</p>
                <button type="button" onClick={own} disabled={pending} className="press flex h-12 w-full items-center justify-center rounded-xl bg-dusk-button px-5 text-[15px] font-semibold text-dusk-button-text hover:bg-dusk-button/85 disabled:opacity-70">
                  {pending ? "Starting…" : "Start an empty plan"}
                </button>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
            )}
            {door === "atlas" && <PlanWizard mode="rebuild" initial={prefs} after="/today" first />}
          </>
        )}
      />
      <Link href="/workouts/new" className="press mt-2 flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-ink-soft hover:text-ink sm:max-w-md">
        Log another workout
      </Link>
    </section>
  );
}
