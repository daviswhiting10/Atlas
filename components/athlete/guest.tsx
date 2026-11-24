"use client";

import { useSheetLock } from "@/hooks/use-sheet-lock";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import Link from "next/link";
import { Check, Loader2, Play } from "lucide-react";
import type { Prefs } from "@/lib/plan/generator";
import { cn } from "@/lib/utils";
import { useEscape } from "@/hooks/use-escape";
import { GUEST_EMAIL_DOMAIN } from "@/lib/auth/route-policy";

type GuestInput = { name?: string; prefs?: Prefs; demo?: boolean };

/** Creates a guest account (optionally pre-filled with demo history) and enters the app. */
export function useGuestSignIn() {
  const [pending, setPending] = useState<null | "plan" | "demo">(null);
  /** The demo is at its hourly cap: what to retry with. */
  const [busy, setBusy] = useState<GuestInput | null>(null);

  const start = useCallback(async (input: GuestInput) => {
    setBusy(null);
    setPending(input.demo ? "demo" : "plan");
    try {
      // Loaded on demand: importing next-auth/react at module level breaks
      // server rendering of any page that includes this component.
      const { signIn } = await import("next-auth/react");
      const res = await signIn("guest", { payload: JSON.stringify(input), redirect: false });
      if (res?.code === "demo_busy") {
        setPending(null);
        setBusy(input);
        return;
      }
      if (!res || res.error) throw new Error(res?.error ?? "Sign-in failed");
      window.location.assign("/today");
    } catch {
      setPending(null);
      toast.error("Couldn't set things up. Please try again.");
    }
  }, []);

  return { pending, start, busy, dismissBusy: () => setBusy(null) };
}

/** "The demo is busy": never a raw error. A retry button, and a way out. */
export function DemoBusy({ input, onRetry, onClose }: { input: GuestInput | null; onRetry: (input: GuestInput) => void; onClose: () => void }) {
  useSheetLock();
  useEscape(input != null, onClose);
  if (!input) return null;
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-night/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="The demo is busy"
        onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full rounded-t-[24px] border-t border-line bg-bone px-5 pt-6 sm:mx-auto sm:max-w-md sm:rounded-[24px] sm:border"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">The demo is busy</h2>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">Try again in a few minutes.</p>
        <button type="button" onClick={() => onRetry(input)} className="press mt-6 h-14 w-full rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90">
          Try again
        </button>
        <button type="button" onClick={onClose} className="press mt-1 min-h-11 w-full text-[15px] font-medium text-ink-soft hover:text-ink">
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}

const STEPS = {
  plan: ["Reading your goal", "Choosing your split", "Picking exercises", "Scheduling 12 weeks"],
  demo: ["Creating a demo coach", "Adding five clients", "Logging five months of training", "Drawing the charts"],
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
                  i < step ? "border-signal bg-signal text-bone" : i === step ? "border-signal text-signal" : "border-line text-transparent"
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

/** Already in a demo (or any guest session) in this browser? Checked again when Back restores this page from the browser's cache. */
function useInGuestSession() {
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () =>
      fetch("/api/auth/session", { cache: "no-store" })
        .then((r) => r.json())
        .then((s) => live && setGuest(typeof s?.user?.email === "string" && s.user.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)))
        .catch(() => {});
    check();
    const show = (e: PageTransitionEvent) => e.persisted && check();
    window.addEventListener("pageshow", show);
    return () => {
      live = false;
      window.removeEventListener("pageshow", show);
    };
  }, []);
  return guest;
}

/** "Explore a live demo", or, with a demo already open in this browser, "Continue demo": straight to Today, no new workspace. */
export function DemoButton({ className }: { className?: string }) {
  const { pending, start, busy, dismissBusy } = useGuestSignIn();
  const inGuest = useInGuestSession();
  if (inGuest) {
    return (
      <Link href="/today" className={className}>
        <Play className="h-4 w-4 fill-current" /> Continue demo
      </Link>
    );
  }
  return (
    <>
      <button type="button" disabled={pending != null} onClick={() => start({ demo: true })} className={className}>
        <Play className="h-4 w-4 fill-current" /> Explore a live demo
      </button>
      <BuildingOverlay mode={pending} />
      <DemoBusy input={busy} onRetry={start} onClose={dismissBusy} />
    </>
  );
}
