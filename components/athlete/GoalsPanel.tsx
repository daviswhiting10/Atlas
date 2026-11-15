"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { Prefs } from "@/lib/plan/generator";
import { PlanWizard } from "./PlanWizard";
import { SignOutButton } from "./SignOutButton";

/**
 * Profile actions. Changing goals (and, for a coach, picking one of their own programs)
 * stays out of the way until it is asked for.
 */
export function GoalsPanel({ prefs, canRebuild, isGuest, initiallyOpen, extra }: { prefs: Prefs; canRebuild: boolean; isGuest: boolean; initiallyOpen: boolean; extra?: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen && canRebuild);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        {canRebuild && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[15px] font-semibold text-white hover:bg-ink/85 sm:w-auto"
          >
            {open ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
            {open ? "Close" : "Change goals"}
          </button>
        )}
        <div className="flex-1 sm:w-44 sm:flex-none">
          <SignOutButton isGuest={isGuest} />
        </div>
      </div>

      {open && (
        <section className="fade-in rule mt-8 pt-8">
          <PlanWizard mode="rebuild" initial={prefs} />
          {extra && <div className="rule mt-8 pt-8">{extra}</div>}
        </section>
      )}
    </>
  );
}
