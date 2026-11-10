"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import type { Prefs } from "@/lib/plan/generator";
import { cn } from "@/lib/utils";

/** Creates a guest account (optionally pre-filled with demo history) and enters the app. */
export function useGuestSignIn() {
  const [pending, setPending] = useState<null | "plan" | "demo">(null);

  const start = useCallback(async (input: { name?: string; prefs?: Prefs; demo?: boolean }) => {
    setPending(input.demo ? "demo" : "plan");
    try {
      // Loaded on demand: importing next-auth/react at module level breaks
      // server rendering of any page that includes this component.
      const { signIn } = await import("next-auth/react");
      const res = await signIn("guest", { payload: JSON.stringify(input), redirect: false });
      if (!res || res.error) throw new Error(res?.error ?? "Sign-in failed");
      window.location.assign("/today");
    } catch {
      setPending(null);
      toast.error("Couldn't set things up. Please try again.");
    }
  }, []);

  return { pending, start };
}

const STEPS = {
  plan: ["Reading your goal", "Choosing your split", "Picking exercises", "Scheduling 12 weeks"],
  demo: ["Creating a demo athlete", "Building a 12-week plan", "Logging 9 weeks of training", "Drawing the charts"],
};

export function BuildingOverlay({ mode }: { mode: null | "plan" | "demo" }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!mode) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS[mode].length - 1)), 900);
    return () => clearInterval(t);
  }, [mode]);

  if (!mode) return null;
  const steps = STEPS[mode];

  // Portalled to <body>: an animated (transformed) ancestor would otherwise
  // trap this fixed overlay inside its own box.
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-bone/90 px-6 backdrop-blur-md" role="status" aria-live="polite">
      <div className="w-full max-w-sm">
        <p className="eyebrow">{mode === "demo" ? "Setting up the demo" : "Building your plan"}</p>
        <h2 className="mt-2 font-display text-4xl text-ink">One moment…</h2>
        <ul className="mt-8 space-y-3">
          {steps.map((label, i) => (
            <li key={label} className={cn("flex items-center gap-3 text-[15px] transition-opacity duration-300", i > step ? "opacity-35" : "opacity-100")}>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border transition-colors duration-300",
                  i < step ? "border-blue bg-blue text-white" : i === step ? "border-blue text-blue" : "border-line text-transparent"
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i === step ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              </span>
              <span className="text-ink">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}

export function DemoButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const { pending, start } = useGuestSignIn();
  return (
    <>
      <button type="button" disabled={pending != null} onClick={() => start({ demo: true })} className={className}>
        {children}
      </button>
      <BuildingOverlay mode={pending} />
    </>
  );
}
