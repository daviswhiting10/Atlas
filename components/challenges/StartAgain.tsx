"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Start = (raw: { templateKey: string; startDay: string; shownDay: number; diet?: string }) => Promise<{ ok: true; goalId: string } | { ok: false; error: string }>;

/**
 * "Start again" on a failed challenge: the same challenge, from today, day 1, with the same diet wording. It goes
 * through the normal start (startGoal), so the server checks it the same way.
 */
export function StartAgain({ templateKey, today, diet, start }: { templateKey: string; today: string; diet: string | null; start: Start }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const go = () =>
    run(async () => {
      const r = await start({ templateKey, startDay: today, shownDay: 1, ...(diet ? { diet } : {}) }).catch(() => ({ ok: false as const, error: "Couldn't start it." }));
      if (!r.ok) return void toast.error(r.error);
      router.replace(`/challenges/${r.goalId}`);
      router.refresh();
    });
  return (
    <button type="button" onClick={go} disabled={pending} className="press mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-dusk-button text-[16px] font-semibold text-dusk-button-text">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Start again
    </button>
  );
}
